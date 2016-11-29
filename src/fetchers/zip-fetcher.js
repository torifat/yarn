/* @flow */

import {SecurityError, MessageError} from '../errors.js';
import type {FetchedOverride} from '../types.js';
import {UnpackStream} from '../util/stream.js';
import {ZIP_FILENAME} from '../constants.js';
import * as crypto from '../util/crypto.js';
import BaseFetcher from './base-fetcher.js';
import * as fsUtil from '../util/fs.js';

const invariant = require('invariant');
const yauzl = require('yauzl');
const path = require('path');
const url = require('url');
const fs = require('fs');

export default class ZipFetcher extends BaseFetcher {
  async getResolvedFromCached(hash: string): Promise<?string> {
    const mirrorPath = this.getMirrorPath();
    if (mirrorPath == null) {
      // no mirror
      return null;
    }

    const ziplLoc = path.join(this.dest, ZIP_FILENAME);
    if (!(await fsUtil.exists(ziplLoc))) {
      // no tarball located in the cache
      return null;
    }

    // copy the file over
    if (!await fsUtil.exists(mirrorPath)) {
      await fsUtil.copy(ziplLoc, mirrorPath, this.reporter);
    }

    const relativeMirrorPath = this.getRelativeMirrorPath(mirrorPath);
    invariant(relativeMirrorPath != null, 'Missing offline mirror path');

    return `${relativeMirrorPath}#${hash}`;
  }

  getMirrorPath(): ?string {
    const {pathname} = url.parse(this.reference);

    if (pathname == null) {
      return this.config.getOfflineMirrorPath();
    }

    let packageFilename = path.basename(pathname);

    // handle scoped packages
    const pathParts = pathname.slice(1).split('/');
    if (pathParts[0][0] === '@') {
      // scoped npm package
      packageFilename = `${pathParts[0]}-${packageFilename}`;
    }

    return this.config.getOfflineMirrorPath(packageFilename);
  }

  getRelativeMirrorPath(mirrorPath: string): ?string {
    const offlineMirrorPath = this.config.getOfflineMirrorPath();
    if (offlineMirrorPath == null) {
      return null;
    }
    return path.relative(offlineMirrorPath, mirrorPath);
  }

  async fetchFromLocal(pathname: ?string): Promise<FetchedOverride> {
    console.log('fetchFromLocal');
    // const {reference: ref, config} = this;
    // const {reporter} = config;
    //
    // // path to the local tarball
    // let localTarball;
    // let isOfflineTarball = false;
    //
    // const relativeFileLoc = pathname ? path.join(config.cwd, pathname) : null;
    // if (relativeFileLoc && await fsUtil.exists(relativeFileLoc)) {
    //   // this is a reference to a file relative to the cwd
    //   localTarball = relativeFileLoc;
    // } else {
    //   // generate a offline cache location
    //   const offlineMirrorPath = config.getOfflineMirrorPath() || '';
    //   localTarball = path.resolve(offlineMirrorPath, ref);
    //   isOfflineTarball = true;
    // }
    //
    // if (!(await fsUtil.exists(localTarball))) {
    //   throw new MessageError(reporter.lang('tarballNotInNetworkOrCache', ref, localTarball));
    // }
    //
    // return new Promise((resolve, reject) => {
    //   const {validateStream, extractorStream} = this.createExtractor(null, resolve, reject);
    //
    //   const cachedStream = fs.createReadStream(localTarball);
    //
    //   cachedStream
    //     .pipe(validateStream)
    //     .pipe(extractorStream)
    //     .on('error', function(err) {
    //       let msg = 'errorDecompressingTarball';
    //       if (isOfflineTarball) {
    //         msg = 'fetchErrorCorrupt';
    //       }
    //       reject(new MessageError(reporter.lang(msg, err.message, localTarball)));
    //     });
    // });
  }

  unzip(source: string, options: Object): Promise<Object> {
    return new Promise((resolve, reject) => {
      yauzl.open(source, options, (error, zipfile) => {
        if (error) {
          reject(error);
        }
        resolve(zipfile);
      });
    });
  }

  fetchFromExternal(): Promise<FetchedOverride> {
    const {reference: ref} = this;
    const registry = this.config.registries[this.registry];

    return registry.request(ref, {
      headers: {
        'Accept-Encoding': 'gzip',
        'Accept': 'application/octet-stream',
      },
      buffer: true,
      process: (req, resolve, reject) => {
        const zipStorePath = path.join(this.dest, ZIP_FILENAME);
        // TODO: use a validateStream
        req.pipe(fs.createWriteStream(zipStorePath))
          .on('error', reject)
          .on('close', async () => {
            const zipfile = await this.unzip(zipStorePath, {lazyEntries: true});
            zipfile.readEntry();
            zipfile.on('entry', async (entry) => {
              const fileName = entry.fileName.split('/').slice(1).join('/');
              const dest = path.join(this.dest, fileName);
              if (/\/$/.test(entry.fileName)) {
                // directory file names end with '/'
                await fsUtil.mkdirp(dest);
                zipfile.readEntry();
              } else {
                // file entry
                zipfile.openReadStream(entry, async (error, readStream) => {
                  if (error) {
                    reject(error);
                  }
                  // ensure parent directory exists
                  await fsUtil.mkdirp(path.dirname(dest));
                  readStream.pipe(fs.createWriteStream(dest));
                  readStream.on('end', async () => {
                    // HACK: for some weird reason composer.json doesn't contain version :-/
                    if (fileName === 'composer.json') {
                      const raw = await fsUtil.readFile(dest);
                      const json = JSON.parse(raw);
                      json.version = this.remote.version;
                      await fsUtil.writeFile(dest, JSON.stringify(json));
                    }
                    zipfile.readEntry();
                  });
                });
              }
            })
            .on('error', reject)
            .on('end', () => {
              zipfile.close();
              resolve({
                hash: this.hash,
                resolved: null,
              });
            });
          });
      },
    });
  }

  _fetch(): Promise<FetchedOverride> {
    const {protocol, pathname} = url.parse(this.reference);
    if (protocol === null && typeof pathname === 'string') {
      return this.fetchFromLocal(pathname);
    } else {
      return this.fetchFromExternal();
    }
  }
}
