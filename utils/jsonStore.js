const fs = require('fs');
const path = require('path');

function writeJsonAtomic(filePath, data) {
  const json = JSON.stringify(data, null, 2);
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp`);
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, filePath);
}

module.exports = { writeJsonAtomic };