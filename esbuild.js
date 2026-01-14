
import process from 'node:process';
import esbuild from 'esbuild';
import {sassPlugin} from "esbuild-sass-plugin";

const ctx = await esbuild.context({
  bundle: true,
  minify: !process.env.DEV,
  entryPoints: ['./src/js/main.js'],
  outfile: './web/transmission.js',
  plugins: [sassPlugin()],
});

if (process.env.DEV) {
  await ctx.watch();
  console.log('watching...');
} else {
  await ctx.rebuild();
  ctx.dispose();
}
