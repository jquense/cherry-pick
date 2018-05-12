const fs = require('fs')
const path = require('path')
const { promisify } = require('util')
const glob = require('tiny-glob')

const readDir = promisify(fs.readdir)
const mkDir = promisify(fs.mkdir)
const rimraf = promisify(require('rimraf'))
const stat = promisify(fs.stat)
const writeFile = promisify(fs.writeFile)

const isFile = path =>
	stat(path)
		.then(stats => stats.isFile())
		.catch(() => false)

const withDefaults = ({ cwd = '.', ...options } = {}, additionalDefaults = {}) => ({
	inputDir: 'src',
	cwd: path.resolve(process.cwd(), cwd),
	...additionalDefaults,
	...options,
})

const commonDefaults = {

}

const noop = () => {}

const findFiles = async ({ cwd, inputDir }) => {
	const filePaths = await glob(path.join(inputDir, '!(index).{js,ts}'), { cwd })
	return filePaths.map(filePath =>
		path.basename(filePath).replace(/\.(js|ts)$/, '')
	)
}

const pkgCache = new WeakMap()

const getPkgName = options => {
	const pkgName = require(path.join(options.cwd, 'package.json')).name
	pkgCache.set(options, pkgName)
	return pkgName
}

const fileProxy = async (options, file) => {
	const { cwd, cjsDir, esDir, typesDir } = options
	const pkgName = pkgCache.has(options)
		? pkgCache.get(options)
		: getPkgName(options)

	const proxyPkg = {
		name: `${pkgName}/${file}`,
		private: true,
		main: path.join('..', cjsDir, `${file}.js`),
		module: path.join('..', esDir, `${file}.js`),
	}

	if (typeof typesDir === 'string') {
		proxyPkg.types = path.join('..', typesDir, `${file}.d.ts`)
	} else if (await isFile(path.join(cwd, `${file}.d.ts`))) {
		proxyPkg.types = path.join('..', `${file}.d.ts`)
	}
	return JSON.stringify(proxyPkg, null, 2) + '\n'
}

const cherryPick = async inputOptions => {
	const options = withDefaults(inputOptions, {
		cjsDir: 'lib',
		esDir: 'es',
	})

	const files = await findFiles(options)

	await Promise.all(
		files.map(async file => {
			const proxyDir = path.join(options.cwd, file)
			await mkDir(proxyDir).catch(noop)
			await writeFile(
				`${proxyDir}/package.json`,
				await fileProxy(options, file)
			)
		})
	)

	return files
}

const clean = async inputOptions => {
	const options = withDefaults(inputOptions)
	const files = await findFiles(options)
	await Promise.all(
		files.map(async file => rimraf(path.join(options.cwd, file)))
	)
	return files
}

module.exports.default = cherryPick
module.exports.clean = clean