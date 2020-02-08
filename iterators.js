const errHandler = err => { throw err };

async function getFoldersWithName(context, currentDir, folderName, nextPageToken) {
    const params = {
        q: `name = '${folderName}' and '${currentDir.id}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
        supportsTeamDrives: true,
        includeTeamDriveItems: true,
        spaces: "drive",
        pageToken: nextPageToken || undefined
    };
    
    const data = await context.pushOperation(async(api) => {
        const resp = await api.files.list(params).catch(errHandler);
        return resp.data;
    }).catch(errHandler);

    if (data.nextPageToken) {
        return data.files.concat(await getFoldersWithName(context, currentDir, folderName, data.nextPageToken).catch(errHandler));
    }
    return data.files;
}

async function* getEntryIterator(context, currentDir, condition, nextPageToken) {
    const params = {
        q: `'${currentDir.id}' in parents and trashed = false and ${condition}`,
        supportsTeamDrives: true,
        includeTeamDriveItems: true,
        spaces: "drive",
        pageToken: nextPageToken || undefined
    };
    
    const data = await context.pushOperation(async(api) => {
        const resp = await api.files.list(params).catch(errHandler);
        return resp.data;
    }).catch(errHandler);

    for (const file of data.files) {
        yield file;
    }

    if (data.nextPageToken) {
        const nextPage = getEntryIterator(context, currentDir, data.nextPageToken);
        let file = await nextPage.next().catch(errHandler);
        while (file && !file.done) {
            yield file.value;
            file = await nextPage.next().catch(errHandler);
        }
    }
}

module.exports.getFoldersWithName = async(context, currentDir, folderName) => getFoldersWithName(context, currentDir, folderName, null).catch(errHandler);
module.exports.getFileIterator = async function* (context, currentDir) {
    const generator = getEntryIterator(context, currentDir, "mimeType != 'application/vnd.google-apps.folder'", null);
    let x = await generator.next().catch(errHandler);
    while (x && !x.done) {
        yield x.value;
        x = await generator.next().catch(errHandler);
    }
}
module.exports.getFolderIterator = async function* (context, currentDir) {
    const generator = getEntryIterator(context, currentDir, "mimeType = 'application/vnd.google-apps.folder'", null);
    let x = await generator.next().catch(errHandler);
    while (x && !x.done) {
        yield x.value;
        x = await generator.next().catch(errHandler);
    }
}
