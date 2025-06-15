const fs = require("fs");
const path = require("path");
require("colors")

/**
 * Recursively copies all files and folders from the source directory to the destination directory.
 * 
 * Special behavior:
 * - If a file named '.env.template' is found, it will be copied as '.env' instead.
 * - Files are only copied if they don't already exist in the destination.
 * - Existing files in the destination are skipped.
 * 
 * @param {string} src - The source directory path.
 * @param {string} dest - The destination directory path.
 */
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);

    let destFileName = entry.name === '.env.template' ? '.env' : entry.name;
    const destPath = path.join(dest, destFileName);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
      continue;
    }

    if (!fs.existsSync(destPath)) {
      console.log(`✅ Copying ${srcPath.underline} to ${destPath.underline}`.green)
      fs.copyFileSync(srcPath, destPath);
    } else {
      console.log(`⚠️ ${destPath.underline} already exists, skipping`.yellow)
    }
  }
}


/**
 *
 * It will add some default files to the project, like typings, ServerUtils.ts and .cloudscriptignore
 * @param projectPath {string} - The path where the project will be initialized
 */
function initializeProject(projectPath) {
  const templatePath = path.join(__dirname, "projectTemplate");
  copyDir(templatePath, projectPath);
}

module.exports = initializeProject;
