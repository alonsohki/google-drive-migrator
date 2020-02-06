const {google} = require("googleapis");
const getopt = require("node-getopt");
const iterators = require("./iterators");

async function migratePath(api, teamDrive, path, currentDir, fullPath) {
    try
    {
        if (path.length == 0) {
            console.log(`- Begin migration of ${fullPath} (${currentDir.id})`);
        }
        else {
            const folders = await iterators.getFoldersWithName(api, currentDir, path[0]);
            const newPath = path.slice(1);
            return Promise.all(folders.map(folder => migratePath(api, teamDrive, newPath, folder, fullPath)));
        }
    }
    catch (err) {
        console.error(err);
    }
}

async function migrate(targetDrive, path, simulate) {
    const auth = await require("./auth").authorize("credentials.json", "token.json");
    const api = google.drive({version: 'v3', auth: auth});
    const root = await api.files.get({ fileId: "root" });
    
    const driveList = await api.teamdrives.list();
    for (let teamDrive of driveList.data.teamDrives) {
        if (teamDrive.name == targetDrive) {
            console.log(`- Found TeamDrive ${teamDrive.name} with id ${teamDrive.id}`);
            migratePath(api, teamDrive, path.split("/"), root.data, path)
            break;
        }
    }
}


let opt = getopt.create([
    ["t", "teamdrive=ARG", "Name of the team drive"],
    ["p", "path=ARG", "Path to migrate"],
    ["", "simulate", "Use this flag if you want to only simulate the migration"],
    ["h", "help", "Display this help"]
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
    const simulate = opt.options.simulate && true;
    migrate(opt.options.teamdrive, opt.options.path, simulate);
}
