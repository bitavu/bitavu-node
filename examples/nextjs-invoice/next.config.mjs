import path from 'node:path';

/** @type {import('next').NextConfig} */
const config = {
  turbopack: { root: path.resolve(import.meta.dirname, '../..') },
};

export default config;
