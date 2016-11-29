/* @flow */

import type {PackagistManifest as Manifest} from '../../types.js';
import type Config from '../../config.js';
import {MessageError} from '../../errors.js';
import RegistryResolver from './registry-resolver.js';
import PackagistRegistry from '../../registries/packagist-registry.js';
import map from '../../util/map.js';
import * as fs from '../../util/fs.js';

const invariant = require('invariant');
const path = require('path');
const os = require('os');
const semver = require('semver');

// const PACKAGIST_REGISTRY = /http[s]:\/\/packagist.org\/packages/g;

type RegistryResponse = {
  name: string,
  versions: { [key: string]: Manifest }
};

export default class PackagistResolver extends RegistryResolver {
  static registry = 'packagist';

  static async findVersionInRegistryResponse(config: Config, range: string, body: RegistryResponse): Promise<Manifest> {
    if (!body['versions']) {
      throw new MessageError(config.reporter.lang('malformedRegistryResponse', body.name));
    }

    // TODO: Handles dev-master later
    const tags = Object.keys(body.versions).filter(semver.valid);

    // FIXME: Sadly they use a custom versioning scheme, not exactly semver
    // ~2.8|~3.0 -> ~2.8 || ~3.0
    const satisfied = await config.resolveConstraints(tags, range.replace(/|/, ' || '));
    if (satisfied) {
      return body.versions[satisfied];
    } else {
      const versions = Object.keys(body.versions);
      throw new MessageError(
        config.reporter.lang(
          'couldntFindVersionThatMatchesRange',
          body.name,
          range,
          (versions.length > 20) ? versions.join(os.EOL) : versions.join(', '),
        ),
      );
    }
  }

  async resolveRequest(): Promise<?Manifest> {
    // TODO: make offline work
    // if (this.config.offline) {
    //   const res = this.resolveRequestOffline();
    //   if (res != null) {
    //     return res;
    //   }
    // }

    const body = await this.config.registries.packagist.request(`${this.name}.json`);
    if (body && body.package) {
      return await PackagistResolver.findVersionInRegistryResponse(this.config, this.range, body.package);
    } else {
      return null;
    }
  }

  async resolveRequestOffline(): Promise<?Manifest> {
    // // find modules of this name
    // const prefix = `npm-${this.name}-`;
    //
    // const cacheFolder = this.config.cacheFolder;
    // invariant(cacheFolder, 'expected packages root');
    //
    // const files = await this.config.getCache('cachedPackages', async (): Promise<Array<string>> => {
    //   const files = await fs.readdir(cacheFolder);
    //   const validFiles = [];
    //
    //   for (const name of files) {
    //     // no hidden files
    //     if (name[0] === '.') {
    //       continue;
    //     }
    //
    //     // ensure valid module cache
    //     const dir = path.join(cacheFolder, name);
    //     if (await this.config.isValidModuleDest(dir)) {
    //       validFiles.push(name);
    //     }
    //   }
    //
    //   return validFiles;
    // });
    //
    // const versions = map();
    //
    // for (const name of files) {
    //   // check if folder starts with our prefix
    //   if (name.indexOf(prefix) !== 0) {
    //     continue;
    //   }
    //
    //   const dir = path.join(cacheFolder, name);
    //
    //   // read manifest and validate correct name
    //   const pkg = await this.config.readManifest(dir, 'npm');
    //   if (pkg.name !== this.name) {
    //     continue;
    //   }
    //
    //   // read package metadata
    //   const metadata = await this.config.readPackageMetadata(dir);
    //   if (!metadata.remote) {
    //     continue; // old yarn metadata
    //   }
    //
    //   versions[pkg.version] = Object.assign({}, pkg, {_remote: metadata.remote});
    // }
    //
    // const satisfied = await this.config.resolveConstraints(Object.keys(versions), this.range);
    // if (satisfied) {
    //   return versions[satisfied];
    // } else if (!this.config.preferOffline) {
    //   throw new MessageError(
    //     this.reporter.lang(
    //       'couldntFindPackageInCache',
    //       this.name,
    //       this.range,
    //       Object.keys(versions).join(', '),
    //     ),
    //   );
    // } else {
    //   return null;
    // }
  }

  cleanRegistry(url: string): string {
    // if (this.config.getOption('registry') === YARN_REGISTRY) {
    //   return url.replace(NPM_REGISTRY, YARN_REGISTRY);
    // } else {
    return url;
    // }
  }

  async resolve(): Promise<Manifest> {
    // lockfile
    const shrunk = this.request.getLocked('zip');
    if (shrunk) {
      return shrunk;
    }

    const info: ?Manifest = await this.resolveRequest();
    if (info == null) {
      throw new MessageError(this.reporter.lang('packageNotFoundRegistry', this.name, PackagistResolver.registry));
    }

    const {dist} = info;
    // TODO: handle dperecation later
    // if (typeof deprecated === 'string') {
      // let human = `${info.name}@${info.version}`;
      // const parentNames = this.request.getParentNames();
      // if (parentNames.length) {
      //   human = parentNames.concat(human).join(' > ');
      // }
      // this.reporter.warn(`${human}: ${deprecated}`);
    // }

    // Testing
    if (info.require) {
      info.dependencies = Object.keys(info.require)
        .filter((dep) => dep.indexOf('/') >= 0)
        .reduce((acc, dep) => {
          if (info.require) { // <- Need this to make flow happy, this is really weird :-/
            acc[dep] = info.require[dep];
          }
          return acc;
        }, {});
    }

    if (dist != null && dist.url && dist.type) {
      if (dist.type !== 'zip') {
        // FIXME: use this.reporter.lang
        throw new MessageError(`dist type ${dist.type} not supported`);
      }

      info._remote = {
        resolved: `${this.cleanRegistry(dist.url)}#${dist.reference}`,
        type: 'zip',
        reference: this.cleanRegistry(dist.url),
        hash: dist.reference,
        registry: 'packagist',
        version: info.version,
      };
    }

    info._uid = info.version;

    return info;
  }
}
