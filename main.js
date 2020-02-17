const {google} = require("googleapis");
const iterators = require("./iterators");
const throttle = require("./throttle");

const errHandler = err => { throw err };

function escapeQuotes(name) {
    return name.replace(/'/g, "\\'");
}

async function fileExists(context, file, dir, condition) {
    const query = `'${dir.id}' in parents and name = '${escapeQuotes(file.name)}' and trashed = false and ${condition}`;
    const metadata = {
        q: query,
        supportsTeamDrives: true,
        includeTeamDriveItems: true,
    };
    return await context.pushOperation(async(api) => {
        const resp = await api.files.list(metadata).catch(errHandler);
        const data = resp.data;
        if (data.files && data.files.length > 0) {
            return data.files[0];
        }
    });
}

async function startMigration(context, teamDriveDir, teamDriveDirJustCreated, directory, fullSourcePath, fullTargetPath) {
    let sharedDir = null;
    let isNewFolder;

    fullSourcePath = `${fullSourcePath}/${directory.name}`;
    fullTargetPath = `${fullTargetPath}/${directory.name}`;

    // Check if the target dir already exists in the team drive
    if (teamDriveDir && !teamDriveDirJustCreated) {
        sharedDir = await fileExists(context, directory, teamDriveDir, "mimeType = 'application/vnd.google-apps.folder'");
    }

    // Create, if necessary, the target dir
    if (sharedDir == null) {
        if (!context.simulate) {
            const metadata = {
                requestBody: {
                    name: directory.name,
                    mimeType: "application/vnd.google-apps.folder",
                    parents: [ teamDriveDir.id ],
                },
                supportsTeamDrives: true,
                includeTeamDriveItems: true
            };

            sharedDir = await context.pushOperation(async(api) => {
                const resp = await api.files.create(metadata).catch(errHandler);
                return resp.data;
            });
        }
        isNewFolder = true;
        console.log(`[CREATE:dir] ${fullTargetPath}`);
    }
    else {
        isNewFolder = false;
        console.log(`[REUSE:dir] ${fullTargetPath}`);
    }

    // Migrate all the subdirs
    const folderIterator = iterators.getFolderIterator(context, directory);
    let dir = await folderIterator.next().catch(errHandler);
    while (dir && !dir.done) {
        await startMigration(context, sharedDir, isNewFolder, dir.value, fullSourcePath, fullTargetPath).catch(errHandler);
        dir = await folderIterator.next().catch(errHandler);
    }

    // Move or copy all the files
    const fileIterator = iterators.getFileIterator(context, directory);
    let current = await fileIterator.next().catch(errHandler);
    while (current && !current.done) {
        const file = current.value;
        if (!file || !file.name) {
            throw file;
        }

        if (context.copy) {
            if (!isNewFolder && sharedDir && await fileExists(context, file, sharedDir, "mimeType != 'application/vnd.google-apps.folder'")) {
                console.log(`[IGNORE:file] ${fullSourcePath}/${file.name}`);
            }
            else {
                if (!context.simulate) {
                    await context.pushOperation(async(api) => {
                        const metadata = {
                            fileId: file.id,
                            requestBody: {
                                parents: [sharedDir.id]
                            },
                            supportsTeamDrives: true,
                            includeTeamDriveItems: true
                        };
                        await api.files.copy(metadata).catch(errHandler);
                    });
                }
                console.log(`[COPY:file] ${fullSourcePath}/${file.name}`);
            }
        }
        else {
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
        }

        current = await fileIterator.next().catch(errHandler);
    }

    // Delete the source directory
    if (!context.keepFolders && !context.copy) {
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
        return startMigration(context, teamDrive, false, currentDir, fullPath, `[${teamDrive.name}]`).catch(errHandler);
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
        copy: options.copy,
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

module.exports.migrate = migrate;
