const path = require('node:path');

module.exports = {
  mode: 'development',
  entry: {
    content: './src/content.ts',
    background: './src/background.ts',
    sidepanel: './src/sidepanel.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name(module, chunks) {
            // Get name of the chunk containing this module
            const allChunksNames = chunks.map((item) => item.name).join('~');

            // Get the module name
            const moduleFileName = module
              .identifier()
              .split('/')
              .reduceRight((item) => item);

            return `${allChunksNames}-${moduleFileName}`;
          },
          priority: -10,
        },
      },
    },
  },
  devtool: 'inline-source-map',
};
