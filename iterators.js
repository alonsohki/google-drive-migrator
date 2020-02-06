async function getFoldersWithName(api, currentDir, folderName, nextPageToken) {
    const params = {
        q: `name = '${folderName}' and '${currentDir.id}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
        supportsTeamDrives: true,
        includeTeamDriveItems: true,
        spaces: "drive",
        pageToken: nextPageToken || undefined
    };
    
    const resp = await api.files.list(params);
    const data = resp.data;

    if (data.nextPageToken) {
        return data.files.concat(await getFoldersWithName(api, currentDir, folderName, data.nextPageToken));
    }
    return data.files;
}

module.exports.getFoldersWithName = async(api, currentDir, folderName) => getFoldersWithName(api, currentDir, folderName, null);
