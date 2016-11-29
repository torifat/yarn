/* @flow */

import BaseFetcher from './base-fetcher.js';
import CopyFetcher from './copy-fetcher.js';
import GitFetcher from './git-fetcher.js';
import TarballFetcher from './tarball-fetcher.js';
import ZipFetcher from './zip-fetcher.js';

export {BaseFetcher as base};
export {CopyFetcher as copy};
export {GitFetcher as git};
export {TarballFetcher as tarball};
export {ZipFetcher as zip};

export type Fetchers =
  | BaseFetcher
  | CopyFetcher
  | GitFetcher
  | TarballFetcher
  | ZipFetcher;

export type FetcherNames =
  | 'base'
  | 'copy'
  | 'git'
  | 'tarball'
  | 'zip';
