/* @flow */

import YarnRegistry from './yarn-registry.js';
import NpmRegistry from './npm-registry.js';
import PackagistRegistry from './packagist-registry.js';

export const registries = {
  npm: NpmRegistry,
  yarn: YarnRegistry,
  packagist: PackagistRegistry,
};

export const registryNames = Object.keys(registries);

export type RegistryNames = $Keys<typeof registries>;
export type ConfigRegistries = {
  npm: NpmRegistry,
  yarn: YarnRegistry,
  packagist: PackagistRegistry,
};
