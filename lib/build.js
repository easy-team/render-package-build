'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const md5 = require('md5');
const moment = require('moment');
const merge = require('webpack-merge');

module.exports = class PackageBuilder {
  constructor(options = {}) {
    this.options = {
      package: true,
      baseDir: process.cwd(),
      dist: 'dist',
      publicPath: '/public/',
      client: 'client',
      server: 'server',
      file: path.join(os.tmpdir(), 'render-package.json'),
      ...options
    };
    this.isDev = process.argv.pop() === 'dev';
    this.pkg = require(path.join(this.options.baseDir, 'package.json'));
    this.tag = this.options.tag || md5(this.pkg.name).slice(0, 8);
    this.version = this.options.version || this.pkg.version;
    if (this.options.version) {
      this.version = this.options.version;
    } else if (this.isDev) {
      this.version = this.pkg.version;
    } else {
      const v = this.pkg.version.split('.');
      v[v.length - 1] = Number(v[v.length - 1]) + 1;
      this.version = v.join('.');
    }
    this.dist = path.join(this.options.baseDir, this.options.dist, this.tag, this.version);
    this.server = path.join(this.dist, this.options.server);
    this.client = path.join(this.dist, this.options.client);
  }

  getVueWebpackConfig(config = {}) {
    const engine = 'vue';
    const render = 'render';
    const pkgInfos = this.createPackageInfoByEntry(config.entry, engine, render);
    this.savePackageInfo(pkgInfos);
    return this.getWebpackConfig({
      framework: engine,
      ...config
    });
  }

  getReactWebpackConfig(config = {}) {
    const engine = 'react';
    const render = 'render';
    const pkgInfos = this.createPackageInfoByEntry(config.entry, engine, render);
    this.savePackageInfo(pkgInfos);
    return this.getWebpackConfig({
      framework: engine,
      ...config
    });
  }

  getWebpackConfig(config = {}) {
    const { publicPath, dist } = this.options;
    const self = this;
    return merge({
      egg: 'true',
      output: {
        publicPath: `${publicPath}${this.tag}/${this.version}/`
      },
      plugins: {
        manifest: {
          assets: true,
          fileName: `${dist}/${this.tag}/${this.version}/manifest.json`
        }
      },
      customize(webpackConfig) {
        const { target } = webpackConfig;
        if (target === 'node') {
          webpackConfig.output.path = self.server;
        } else {
          webpackConfig.output.path = self.client;
        }
        return webpackConfig;
      }
    }, config);
  }

  done() {
    this.pkg.version = this.version;
    fs.writeFileSync(path.join(this.dist, 'package.json'), JSON.stringify(this.pkg, null, 2), 'utf8');
  }

  createPackageInfo(info) {
    const pkgInfo = {
      env: this.isDev ? 'dev' : 'prod',
      name: this.pkg.name,
      version: this.version,
      tag: this.tag,
      online: true,
      clientdir: this.options.client,
      serverdir: this.options.server,
      manifest: './manifest.json',
      time: moment(new Date()).format('YYYY-MM-DD HH:mm:ss'),
      ...info
    };
    return pkgInfo;
  }

  createPackageInfoByEntry(entry, engine, render) {
    const routes = Object.keys(entry);
    return routes.map(route => {
      return this.createPackageInfo({ entry: `${route}.js`, route: `/${route}`, engine, render });
    });
  }

  savePackageInfo(pkgInfos) {
    const { pkgs } = this.getPackageInfo({ pkgs: [] });
    pkgInfos.forEach(pkgInfo => {
      const index = pkgs.findIndex(item => {
        return item.route === pkgInfo.route;
      });
      if (index > -1) {
        pkgs.splice(index, 1, pkgInfo);
      } else {
        pkgs.unshift(pkgInfo);
      }
    });
    fs.writeFileSync(this.options.file, JSON.stringify({ pkgs }, null, 2), 'utf8');
  }

  getPackageInfo(defaultValue = null) {
    return fs.existsSync(this.options.file) ? require(this.options.file) : defaultValue;
  }
};