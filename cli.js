#!/usr/bin/env node

const getopt = require("node-getopt");
const {migrate} = require("./main");

let opt = getopt.create([
    ["t", "teamdrive=ARG",      "Name of the team drive"],
    ["p", "path=ARG",           "Path to migrate"],
    ["",  "max-operations=ARG", "Maximum number of parallel operations (default 10)"],
    ["k", "keep-folders",       "Do NOT remove the source folders after all the files have been moved"],
    ["c", "copy",               "Copy the files instead of moving"],
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
        copy: opt.options.copy && true,
        simulate: opt.options.simulate && true,
        maxOperations: opt.options["max-operations"] || 10,
    };
    migrate(options);
}
