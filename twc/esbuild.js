import process from 'node:process';
import esbuild from 'esbuild';

import { sassPlugin } from "esbuild-sass-plugin";

import { startServer } from "./http-server.js";

const isDev = process.argv.includes('--dev');

const ctx = await esbuild.context({
  bundle: true,
  minify: !isDev,
  plugins: [sassPlugin()],
  entryPoints: [
    'src/css/twc.scss',
    'src/js/twc.js',
  ],
  entryNames: '[name]',
  outdir: 'web',
});

if (isDev) {
  await ctx.watch();
  startServer();
} else {
  await ctx.rebuild();
  ctx.dispose();
}