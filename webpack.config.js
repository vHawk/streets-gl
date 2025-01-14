const dotenv = require('dotenv');
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const {CleanWebpackPlugin} = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const ESLintPlugin = require('eslint-webpack-plugin');
const {EsbuildPlugin} = require('esbuild-loader');

const childProcess = require('child_process');
const {DefinePlugin} = require("webpack");
const COMMIT_SHA = childProcess.execSync('git rev-parse HEAD').toString().trim();
const COMMIT_BRANCH = childProcess.execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
const VERSION = require('./package.json').version;

const isProduction = process.env.NODE_ENV === 'production'

if (!isProduction) {
	dotenv.config();
}

module.exports = (env, argv) => ([{
	entry: './src/app/App.ts',
	output: {
		filename: './js/index.js',
		path: path.resolve(__dirname, 'build')
	},
	performance: {
		maxEntrypointSize: 8000000,
		maxAssetSize: 8000000
	},
	optimization: {
		minimizer: [
			new EsbuildPlugin({
				target: 'es2020'
			})
		]
	},
	devServer: {
		hot: true
	},
	devtool: argv.mode === 'production' ? undefined : 'inline-source-map',
	plugins: [
		new CleanWebpackPlugin(),
		new HtmlWebpackPlugin({
			filename: 'index.html',
			template: './src/index.html',
			minify: argv.mode === 'production'
		}),
		new MiniCssExtractPlugin(),
		new CopyPlugin({
			patterns: [
				{from: './src/resources/textures', to: path.resolve(__dirname, 'build/textures')},
				{from: './src/resources/models', to: path.resolve(__dirname, 'build/models')},
				{from: './src/resources/images', to: path.resolve(__dirname, 'build/images')},
				{from: './src/resources/misc', to: path.resolve(__dirname, 'build/misc')}
			]
		}),
		new ESLintPlugin({
			context: './src',
			extensions: ['ts', 'tsx']
		}),
		new DefinePlugin({
			'process.env': JSON.stringify(
				isProduction
						? process.env // Use system environment variables in production
						: dotenv.config().parsed // Use .env variables in development
		),
			COMMIT_SHA: JSON.stringify(COMMIT_SHA),
			COMMIT_BRANCH: JSON.stringify(COMMIT_BRANCH),
			VERSION: JSON.stringify(VERSION)
		})
	],
	module: {
		rules: [
			{
				test: /\.vert|.frag|.glsl$/i,
				use: [
					{
						loader: 'raw-loader',
						options: {
							esModule: false,
						},
					},
				]
			}, {
				test: /\.css$/i,
				use: [MiniCssExtractPlugin.loader, 'css-loader']
			}, {
				test: /\.s[ac]ss$/i,
				use: [
					'style-loader',
					{
						loader: 'css-loader',
						options: {
							importLoaders: 1,
							modules: true,
							url: false
						},
					},
					'sass-loader'
				],
				sideEffects: true
			}, {
				test: /\.[jt]sx?$/,
				loader: 'esbuild-loader',
				options: {
					target: 'es2020',
					tsconfig: argv.mode === 'production' ? 'tsconfig.prod.json' : 'tsconfig.json'
				}
			},
		]
	},
	resolve: {
		extensions: ['.ts', '.js', '.tsx'],
		alias: {
			'~': path.resolve(__dirname, 'src')
		},
		fallback: {
			url: require.resolve('url'),
			path: require.resolve('path-browserify'),
			fs: false,
		}
	}
}]);
