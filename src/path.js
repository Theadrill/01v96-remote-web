/**
 * Path utility module for absolute path resolution
 */
const path = require('path');

/**
 * Returns absolute path to file from project root level
 * @param {string} filename - filename without extension (e.g., 'config.json')
 * @returns {string} Absolute path string
 */
function getAbsoluteFilePath(filename) {
    const baseName = path.basename(filename);
    if (!baseName || !path.extname(baseName)) return '';
    return `${process.cwd()}/${filename}`;
}

module.exports = {
    getAbsoluteFilePath: getAbsoluteFilePath,
};

/**
 * Returns absolute path to file from source directory
 * @param {string} filename - filename without extension (e.g., 'config.json')
 * @returns {string} Absolute path string
 */
function getSourceFilePath(filename) {
    const baseName = path.basename(filename);
    if (!baseName || !path.extname(baseName)) return '';
    return `${process.cwd()}/src/${filename}`;
}

module.exports = {
    getSourceFilePath: getSourceFilePath,
};

/**
 * Returns absolute path to file from project root (same as getAbsoluteFilePath)
 * @param {string} filename - filename without extension (e.g., 'config.json')
 * @returns {string} Absolute path string
 */
function getProjectRelativeFilePath(filename) {
    const baseName = path.basename(filename);
    if (!baseName || !path.extname(baseName)) return '';
    return `${process.cwd()}/${filename}`;
}

module.exports = {
    getProjectRelativeFilePath: getProjectRelativeFilePath,
};