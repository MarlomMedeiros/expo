import {
  createForProject,
  resolveCurrentPackageManager,
  type NodePackageManager,
} from '@expo/package-manager';
import { execSync } from 'child_process';

import { CLI_NAME } from './cmd';

export type PackageManagerName = NodePackageManager['name'];

const debug = require('debug')('expo:init:resolvePackageManager') as typeof console.log;

/** Determine which package manager to use for installing dependencies based on how the process was started. */
export function resolvePackageManager(): PackageManagerName {
  const currentManager = resolveCurrentPackageManager();
  if (currentManager) {
    debug('Using current package manager: %s', currentManager);
    return currentManager;
  }

  // Try availability
  if (isPackageManagerAvailable('yarn')) {
    return 'yarn';
  } else if (isPackageManagerAvailable('pnpm')) {
    return 'pnpm';
  } else if (isPackageManagerAvailable('bun')) {
    return 'bun';
  }

  return 'npm';
}

export function isPackageManagerAvailable(manager: PackageManagerName): boolean {
  try {
    execSync(`${manager} --version`, { stdio: 'ignore' });
    return true;
  } catch {}
  return false;
}

export function formatRunCommand(packageManager: PackageManagerName, cmd: string) {
  switch (packageManager) {
    case 'pnpm':
      return `pnpm run ${cmd}`;
    case 'yarn':
      return `yarn ${cmd}`;
    case 'bun':
      return `bun run ${cmd}`;
    case 'npm':
    default:
      return `npm run ${cmd}`;
  }
}

export function formatSelfCommand() {
  const packageManager = resolvePackageManager();
  switch (packageManager) {
    case 'pnpm':
      return `pnpx ${CLI_NAME}`;
    case 'bun':
      return `bunx ${CLI_NAME}`;
    case 'yarn':
    case 'npm':
    default:
      return `npx ${CLI_NAME}`;
  }
}

export async function installDependenciesAsync(
  projectRoot: string,
  packageManager: PackageManagerName,
  flags: { silent: boolean } = { silent: false }
) {
  const manager = createForProject(projectRoot, {
    silent: flags.silent,
    bun: packageManager === 'bun',
    npm: packageManager === 'npm',
    pnpm: packageManager === 'pnpm',
    yarn: packageManager === 'yarn',
  });

  await manager.installAsync();
}
