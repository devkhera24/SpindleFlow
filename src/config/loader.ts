import * as fs from "fs";
import * as YAML from "yaml";
import {
  createFileNotFoundError,
  createFileIsDirectoryError,
  createFileEmptyError,
  createFilePermissionError,
  createYAMLParsingError,
} from "./errors";

export function loadYamlConfig(path: string): unknown {
  // Check if file exists
  if (!fs.existsSync(path)) {
    throw createFileNotFoundError(path);
  }

  // Check if path is a directory
  const stats = fs.statSync(path);
  if (stats.isDirectory()) {
    throw createFileIsDirectoryError(path);
  }

  // Try to read the file
  let raw: string;
  try {
    raw = fs.readFileSync(path, "utf-8");
  } catch (error) {
    throw createFilePermissionError(path, error as Error);
  }

  // Check if file is empty
  if (!raw.trim()) {
    throw createFileEmptyError(path);
  }

  // Try to parse YAML
  try {
    return YAML.parse(raw);
  } catch (error) {
    throw createYAMLParsingError(path, error as Error);
  }
}
