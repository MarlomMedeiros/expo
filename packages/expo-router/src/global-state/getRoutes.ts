import { Platform } from 'react-native';

import { DynamicConvention, RouteNode } from '../Route';
import {
  matchDeepDynamicRouteName,
  matchDynamicName,
  matchGroupName,
  removeSupportedExtensions,
} from '../matchers';
import { RequireContext } from '../types';

export type Options = {
  ignore?: RegExp[];
  preserveApiRoutes?: boolean;
  ignoreRequireErrors?: boolean;
  ignoreEntryPoints?: boolean;
  unstable_platformExtensions?: boolean;
  unstable_stripLoadRoute?: boolean;
  unstable_alwaysIncludeSitemap?: boolean;
  unstable_improvedErrorMessages?: boolean;
};

type DirectoryNode = {
  layout?: RouteNode[];
  views: Map<string, RouteNode[]>;
  subdirectories: Map<string, DirectoryNode>;
};

const validPlatforms = new Set(['android', 'ios', 'windows', 'osx', 'native', 'web']);

/** Given a Metro context module, return an array of nested routes. */
export function getRoutes(contextModule: RequireContext, options: Options = {}): RouteNode | null {
  const { directoryTree, hasRoutes, hasLayout } = getDirectoryTree(contextModule, options);

  // If there are no routes
  if (!hasLayout && !hasRoutes) {
    return null;
  }

  // Only include the sitemap if there are routes.
  // TODO: Should we always include the sitemap?
  if (hasRoutes || options.unstable_alwaysIncludeSitemap) {
    appendSitemapRoute(directoryTree);
  }

  appendNotFoundRoute(directoryTree);
  return hoistRoutesToNearestLayout(directoryTree, options);
}

function getDirectoryTree(contextModule: RequireContext, options: Options) {
  const ignoreList = getIgnoreList(options);
  let hasRoutes = false;
  let hasLayout = false;

  const directory: DirectoryNode = {
    views: new Map(),
    subdirectories: new Map(),
  };

  for (const filePath of contextModule.keys()) {
    if (ignoreList.some((regex) => regex.test(filePath))) {
      continue;
    }

    const meta = getFileMeta(filePath, options);

    // This is a file that should be ignored
    if (meta.specificity < 0) {
      continue;
    }

    const leaves: DirectoryNode[] = [];
    for (const key of extrapolateGroups(meta.key)) {
      let node = directory;
      const subdirectoryParts = key.replace(meta.filename, '').split('/').filter(Boolean);

      for (const part of subdirectoryParts) {
        let child = node.subdirectories.get(part);
        if (!child) {
          child = {
            views: new Map(),
            subdirectories: new Map(),
          };
          node.subdirectories.set(part, child);
        }
        node = child;
      }
      leaves.push(node);
    }

    const node: RouteNode = {
      loadRoute() {
        if (options.ignoreRequireErrors) {
          try {
            return contextModule(filePath);
          } catch {
            return {};
          }
        } else {
          return contextModule(filePath);
        }
      },
      contextKey: filePath,
      route: meta.name, // This is overwritten during hoisting
      dynamic: null, // This is calculated during hoisting
      children: [],
      entryPoints: [filePath],
    };

    if (meta.isLayout) {
      hasLayout ||= leaves.length > 0;
      for (const leaf of leaves) {
        leaf.layout ??= [];

        const existing = leaf.layout[meta.specificity];

        if (existing) {
          throw new Error(
            `The layouts "${filePath}" and ${existing.contextKey} conflict in "${meta.dirname}. Please remove one of these files.`
          );
        } else {
          leaf.layout[meta.specificity] = node;
        }
      }
    } else if (meta.isApi) {
      // TODO
    } else {
      hasRoutes ||= leaves.length > 0;
      for (const leaf of leaves) {
        let nodes = leaf.views.get(meta.name);

        if (!nodes) {
          nodes = [];
          leaf.views.set(meta.name, nodes);
        }

        const existing = nodes[meta.specificity];

        if (process.env.NODE_ENV === 'production') {
          nodes[meta.specificity] = node;
        } else {
          if (existing) {
            if (options.unstable_improvedErrorMessages) {
              throw new Error(
                `The routes "${filePath}" and ${existing.contextKey} conflict in "${meta.dirname}. Please remove one of these files.`
              );
            } else {
              throw new Error(
                `Multiple files match the route name "./${meta.filepathWithoutExtensions}".`
              );
            }
          } else {
            nodes[meta.specificity] = node;
          }
        }
      }
    }
  }

  if (!directory.layout) {
    directory.layout = [
      {
        loadRoute: () => ({
          default: (require('./views/Navigator') as typeof import('../views/Navigator'))
            .DefaultNavigator,
        }),
        // Generate a fake file name for the directory
        contextKey: './_layout.tsx',
        entryPoints: ['expo-router/build/views/Navigator.js'],
        route: '',
        generated: true,
        dynamic: null,
        children: [],
      },
    ];
  }

  return { hasRoutes, hasLayout, directoryTree: directory };
}

function appendSitemapRoute(directory: DirectoryNode) {
  if (directory.views.has('_sitemap')) {
    return;
  }

  directory.views.set('_sitemap', [
    {
      loadRoute() {
        const { Sitemap, getNavOptions } = require('./views/Sitemap');
        return { default: Sitemap, getNavOptions };
      },
      route: '_sitemap',
      contextKey: './_sitemap.tsx',
      generated: true,
      internal: true,
      dynamic: null,
      children: [],
      entryPoints: ['expo-router/build/views/Sitemap.js'],
    },
  ]);
}

function appendNotFoundRoute(directory: DirectoryNode) {
  if (directory.views.has('+not-found')) {
    return;
  }

  directory.views.set('+not-found', [
    {
      loadRoute() {
        return { default: require('../views/Unmatched').Unmatched };
      },
      route: '+not-found',
      contextKey: './+not-found.tsx',
      generated: true,
      internal: true,
      dynamic: [{ name: '+not-found', deep: true, notFound: true }],
      children: [],
      entryPoints: ['expo-router/build/views/Unmatched.js'],
    },
  ]);
}

function hoistRoutesToNearestLayout(
  directory: DirectoryNode,
  options: Options,
  parent?: RouteNode,
  entryPoints: string[] = [],
  pathToRemove = ''
) {
  if (directory.layout) {
    const layout = getMostSpecific(directory.layout);
    if (parent) {
      parent.children.push(layout);
    }

    parent = layout;
    const newRoute = parent.route.replace(pathToRemove, '');
    pathToRemove = parent.route ? `${parent.route}/` : '';
    parent.route = newRoute;

    parent.dynamic = generateDynamic(parent.route);

    if (parent.entryPoints) {
      entryPoints = [...entryPoints, ...parent.entryPoints];
      delete parent.entryPoints;
    }

    if (options.ignoreEntryPoints) {
      delete parent.entryPoints;
    }

    // This is only used for testing for easier comparison
    if (options.unstable_stripLoadRoute) {
      delete (parent as any).loadRoute;
    }
  }

  // This should never occur, but it makes the type system happy
  if (!parent) return null;

  for (const routes of directory.views.values()) {
    const route = getMostSpecific(routes);
    const name = route.route.replace(pathToRemove, '');

    const child = {
      ...route,
      route: name,
      dynamic: generateDynamic(name),
      entryPoints: Array.from(new Set([...entryPoints, ...(route.entryPoints || [])])),
    };

    if (options.ignoreEntryPoints) {
      delete (child as any).entryPoints;
    }

    // This is only used for testing for easier comparison
    if (options.unstable_stripLoadRoute) {
      delete (child as any).loadRoute;
    }

    parent.children.push(child);
  }

  for (const child of directory.subdirectories.values()) {
    hoistRoutesToNearestLayout(child, options, parent, entryPoints, pathToRemove);
  }

  return parent;
}

function getMostSpecific(routes: RouteNode[]) {
  const route = routes[routes.length - 1];

  if (!routes[0]) {
    throw new Error(`${route.contextKey} does not contain a fallback platform route`);
  }

  return routes[routes.length - 1];
}

function getFileMeta(key: string, options: Options) {
  // Remove the leading `./`
  key = key.replace(/^\.\//, '');

  const parts = key.split('/');
  const dirname = parts.slice(0, -1).join('/');
  const filename = parts[parts.length - 1];
  const filepathWithoutExtensions = removeSupportedExtensions(key);
  const filenameWithoutExtensions = removeSupportedExtensions(filename);
  const isLayout = filename.startsWith('_layout.');
  const isApi = key.match(/\+api\.[jt]sx?$/);
  let name = isLayout
    ? filepathWithoutExtensions.replace(/\/?_layout$/, '')
    : filepathWithoutExtensions;

  if (filenameWithoutExtensions.startsWith('(') && filenameWithoutExtensions.endsWith(')')) {
    if (options.unstable_improvedErrorMessages) {
      throw new Error(`Invalid route ./${key}. Routes cannot end with \`(group)\` syntax`);
    } else {
      throw new Error(
        `Using deprecated Layout Route format: Move \`./app/${key}\` to \`./app/${filepathWithoutExtensions}/_layout.js\``
      );
    }
  }

  const filenameParts = filenameWithoutExtensions.split('.');
  const platform = filenameParts[filenameParts.length - 1];
  const hasPlatform = validPlatforms.has(platform);

  let specificity = 0;
  if (options.unstable_platformExtensions && hasPlatform) {
    if (platform === Platform.OS) {
      specificity = 2;
    } else if (platform === 'native' && Platform.OS !== 'web') {
      specificity = 1;
    } else {
      specificity = -1;
    }
    name = name.replace(new RegExp(`.${platform}$`), '');
  } else if (hasPlatform) {
    if (validPlatforms.has(platform)) {
      throw new Error('invalid route with platform extension');
    }
  }

  return {
    key,
    name,
    specificity,
    parts,
    dirname,
    filename,
    isLayout,
    isApi,
    filepathWithoutExtensions,
  };
}

function getIgnoreList(options?: Options) {
  const ignore: RegExp[] = [/^\.\/\+html\.[tj]sx?$/, ...(options?.ignore ?? [])];
  if (options?.preserveApiRoutes !== true) {
    ignore.push(/\+api\.[tj]sx?$/);
  }
  return ignore;
}

function extrapolateGroups(key: string, keys: Set<string> = new Set()): Set<string> {
  const match = matchGroupName(key);

  if (!match) {
    keys.add(key);
    return keys;
  }

  const groups = match?.split(',');
  const groupsSet = new Set(groups);

  if (groupsSet.size !== groups.length) {
    throw new Error(`Array syntax cannot contain duplicate group name "${groups}" in "${key}".`);
  }

  if (groups.length === 1) {
    keys.add(key);
    return keys;
  }

  for (const group of groups) {
    extrapolateGroups(key.replace(match, group.trim()), keys);
  }

  return keys;
}

function generateDynamic(path: string) {
  const dynamic: RouteNode['dynamic'] = path
    .split('/')
    .map((part) => {
      if (part === '+not-found') {
        return {
          name: '+not-found',
          deep: true,
          notFound: true,
        };
      }

      const deepDynamicName = matchDeepDynamicRouteName(part);
      const dynamicName = deepDynamicName ?? matchDynamicName(part);

      if (!dynamicName) return null;
      return { name: dynamicName, deep: !!deepDynamicName };
    })
    .filter((part): part is DynamicConvention => !!part);

  if (dynamic?.length === 0) {
    return null;
  }

  return dynamic;
}
