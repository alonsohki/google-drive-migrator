const {google} = require("googleapis");
const getopt = require("node-getopt");
const iterators = require("./iterators");
const throttle = require("./throttle");

const errHandler = err => { throw err };

async function startMigration(context, teamDrive, directory, fullSourcePath, fullTargetPath) {
    let sharedDir = null;

    fullSourcePath = `${fullSourcePath}/${directory.name}`;
    fullTargetPath = `${fullTargetPath}/${directory.name}`;

    // Check if the target dir already exists in the team drive
    if (teamDrive) {
        const query = `'${teamDrive.id}' in parents and name = '${directory.name}' and trashed = false and mimeType = 'application/vnd.google-apps.folder'`;
        const metadata = {
            q: query,
            supportsTeamDrives: true,
            includeTeamDriveItems: true,
        };

        sharedDir = await context.pushOperation(async(api) => {
            const resp = await api.files.list(metadata).catch(errHandler);
            const data = resp.data;
            if (data.files && data.files.length > 0) {
                return data.files[0];
            }
        });
    }

    // Create, if necessary, the target dir
    if (sharedDir == null) {
        if (!context.simulate) {
            const metadata = {
                requestBody: {
                    name: directory.name,
                    mimeType: "application/vnd.google-apps.folder",
                    parents: [ teamDrive.id ],
                },
                supportsTeamDrives: true,
                includeTeamDriveItems: true
            };

            sharedDir = await context.pushOperation(async(api) => {
                const resp = await api.files.create(metadata).catch(errHandler);
                return resp.data;
            });
        }
        console.log(`[CREATE:dir] ${fullTargetPath}`);
    }
    else {
        console.log(`[REUSE:dir] ${fullTargetPath}`);
    }

    // Migrate all the subdirs
    const folderIterator = iterators.getFolderIterator(context, directory);
    let dir = await folderIterator.next().catch(errHandler);
    while (dir && !dir.done) {
        await startMigration(context, sharedDir, dir.value, fullSourcePath, fullTargetPath).catch(errHandler);
        dir = await folderIterator.next().catch(errHandler);
    }

    // Move all the files
    const fileIterator = iterators.getFileIterator(context, directory);
    let current = await fileIterator.next().catch(errHandler);
    while (current && !current.done) {
        const file = current.value;
        if (!file || !file.name) {
            throw file;
        }

        if (!context.simulate) {
            await context.pushOperation(async(api) => {
                const metadata = {
                    fileId: file.id,
                    addParents: sharedDir.id,
                    supportsTeamDrives: true,
                    includeTeamDriveItems: true
                };
                await api.files.update(metadata).catch(errHandler);
            });
        }
        console.log(`[MOVE:file] ${fullSourcePath}/${file.name}`);

        current = await fileIterator.next().catch(errHandler);
    }

    // Delete the source directory
    if (!context.keepFolders) {
        if (!context.simulate) {
            await context.pushOperation(async(api) => {
                const metadata = {
                    fileId: directory.id,
                    supportsTeamDrives: true
                };
                await api.files.delete(metadata);
            });
        }
        console.log(`[DELETE:dir] ${fullSourcePath}`);
    }
}

async function migratePath(context, teamDrive, path, currentDir, fullPath) {
    if (path.length == 0) {
        console.log(`- Begin migration of ${fullPath} (${currentDir.id})`);
        fullPath = fullPath.substring(0, fullPath.lastIndexOf("/"));
        return startMigration(context, teamDrive, currentDir, fullPath, `[${teamDrive.name}]`).catch(errHandler);
    }
    else {
        const folders = await iterators.getFoldersWithName(context, currentDir, path[0]);
        const newPath = path.slice(1);
        return Promise.all(folders.map(folder => migratePath(context, teamDrive, newPath, folder, fullPath)));
    }
}

async function migrate(options) {
    const auth = await require("./auth").authorize("credentials.json", "token.json");
    const api = google.drive({version: 'v3', auth: auth});
    const root = await api.files.get({ fileId: "root" });

    let operations = [];
    const context = {
        simulate: options.simulate,
        keepFolders: options.keepFolders,
        pushOperation: throttle.throttleAsync(async function(operation) {
            return new Promise(async(resolve, reject) => {
                try {
                    if (operations.length >= options.maxOperations) {
                        await Promise.all(operations).catch(errHandler);
                        operations = [];
                    }
                    const promise = operation(api).then(resolve).catch(reject);
                    operations.push(promise);
                }
                catch (err) {
                    return reject(err);
                }
            });
        }, 150)
    };

    const driveList = await api.teamdrives.list();
    for (let teamDrive of driveList.data.teamDrives) {
        if (teamDrive.name == options.teamdrive) {
            console.log(`- Found TeamDrive ${teamDrive.name} with id ${teamDrive.id}`);
            migratePath(context, teamDrive, options.path.split("/"), root.data, options.path).catch(console.error);
            break;
        }
    }
}

let opt = getopt.create([
    ["t", "teamdrive=ARG",      "Name of the team drive"],
    ["p", "path=ARG",           "Path to migrate"],
    ["",  "max-operations=ARG", "Maximum number of parallel operations (default 10)"],
    ["k", "keep-folders",       "Do NOT remove the source folders after all the files have been moved"],
    ["",  "simulate",           "Use this flag if you want to only simulate the migration"],
    ["h", "help",               "Display this help"]
])
.bindHelp()
.parseSystem();

if (!opt.options.teamdrive) {
    console.error("Missing --teamdrive option. Run the command with --help to get more information.");
}
else if (!opt.options.path) {
    console.error("Missing --path option. Run the command with --help to get more information.");
}
else {
    const options = {
        teamdrive: opt.options.teamdrive,
        path: opt.options.path,
        keepFolders: opt.options["keep-folders"] && true,
        simulate: opt.options.simulate && true,
        maxOperations: opt.options["max-operations"] || 10,
    };
    migrate(options);
}
