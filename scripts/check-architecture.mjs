import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { resolve, relative, dirname, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const codeFile = /\.[cm]?[jt]sx?$/
const testFile = /(?:^|\/)(?:test|__tests__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/
const foundation = new Set(['components', 'lib', 'services', 'shared'])
const application = new Set(['app', 'features', 'layouts', 'contexts', 'router'])
const slash = (path) => path.split(sep).join('/')

export function checkArchitecture(root = process.cwd()) {
  root = resolve(root)
  const configPath = resolve(root, 'tsconfig.json')
  const config = ts.readConfigFile(configPath, ts.sys.readFile)
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
  if (parsed.errors.length)
    throw new Error(ts.flattenDiagnosticMessageText(parsed.errors[0].messageText, '\n'))
  const src = resolve(root, 'src')
  const files = readdirSync(src, { recursive: true })
    .map((file) => resolve(src, file))
    .filter(
      (file) =>
        codeFile.test(file) &&
        !/\.d\.[cm]?ts$/.test(file) &&
        !testFile.test(slash(relative(src, file))),
    )
    .sort()
  if (!files.length) throw new Error('没有可检查的生产模块')
  const graph = new Map(files.map((file) => [file, new Set()]))
  const errors = []
  const name = (file) => slash(relative(root, file))
  const alias = (specifier) =>
    Object.keys(parsed.options.paths ?? {}).some((pattern) => {
      const [prefix, suffix] = pattern.split('*')
      return suffix === undefined
        ? specifier === pattern
        : specifier.startsWith(prefix) && specifier.endsWith(suffix)
    })

  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    const layer = name(file).split('/')[1]
    const report = (rule, node, message) =>
      errors.push({
        rule,
        file: name(file),
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        message,
      })
    if (source.parseDiagnostics.length)
      report('parse-error', source, '模块语法无法解析，请先修正类型/编译错误')
    const dependency = (node, literal, typeOnly = false) => {
      if (!literal || !ts.isStringLiteralLike(literal)) {
        report('dynamic-import', node, '模块路径须为可静态检查的字符串字面量')
        return
      }
      const specifier = literal.text
      if (specifier.startsWith('@tauri-apps/') && layer !== 'services') {
        report('native-sdk', node, '原生 SDK 只能由 services 导入')
      }
      const resolved = ts.resolveModuleName(specifier, file, parsed.options, ts.sys).resolvedModule
      const local = specifier.startsWith('.') || specifier.startsWith('/') || alias(specifier)
      let target = resolved ? resolve(resolved.resolvedFileName) : undefined
      if (!target && local) {
        const asset = specifier.startsWith('@/')
          ? resolve(src, specifier.slice(2))
          : resolve(dirname(file), specifier)
        if (existsSync(asset) && statSync(asset).isFile() && !codeFile.test(asset)) target = asset
        else report('unresolved-local', node, `本地模块不存在：${specifier}`)
      }
      if (!target) return
      const targetName = name(target)
      if (!targetName.startsWith('src/')) {
        if (local) report('outside-src', node, `生产模块不能依赖源码目录外的文件：${targetName}`)
        return
      }
      const targetLayer = targetName.split('/')[1]
      if (targetLayer === 'app' && layer !== 'app' && name(file) !== 'src/main.tsx') {
        report('app-entry', node, `只有 app 和主入口可以依赖 app：${targetName}`)
      }
      if (foundation.has(layer) && application.has(targetLayer)) {
        report('foundation', node, `共享基础层不能反向依赖应用/页面层：${targetName}`)
      }
      if (testFile.test(targetName))
        report('production-test', node, `生产模块不能依赖测试代码：${targetName}`)
      if (!typeOnly && graph.has(target)) graph.get(file).add(target)
    }
    const typeBindings = (bindings) =>
      bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.length > 0 &&
      bindings.elements.every((element) => element.isTypeOnly)
    const visit = (node) => {
      if (ts.isImportDeclaration(node)) {
        dependency(
          node,
          node.moduleSpecifier,
          Boolean(
            node.importClause?.isTypeOnly ||
            (!node.importClause?.name && typeBindings(node.importClause?.namedBindings)),
          ),
        )
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const types =
          node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.length > 0 &&
          node.exportClause.elements.every((element) => element.isTypeOnly)
        dependency(node, node.moduleSpecifier, Boolean(node.isTypeOnly || types))
      } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      ) {
        dependency(node, node.moduleReference.expression, node.isTypeOnly)
      } else if (ts.isImportTypeNode(node)) {
        dependency(
          node,
          ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined,
          true,
        )
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      ) {
        dependency(node, node.arguments[0])
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }

  const complete = new Set()
  const stack = []
  const active = new Set()
  const visit = (file) => {
    if (complete.has(file)) return
    if (active.has(file)) {
      const cycle = [...stack.slice(stack.indexOf(file)), file].map(name)
      errors.push({ rule: 'runtime-cycle', file: name(file), line: 1, message: cycle.join(' → ') })
      return
    }
    active.add(file)
    stack.push(file)
    for (const target of graph.get(file)) visit(target)
    stack.pop()
    active.delete(file)
    complete.add(file)
  }
  for (const file of files) visit(file)
  return { files: files.length, errors }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = checkArchitecture()
    for (const error of result.errors)
      console.error(`${error.file}:${error.line} [${error.rule}] ${error.message}`)
    if (result.errors.length) process.exitCode = 1
    else console.log(`架构检查通过：${result.files} 个生产模块`)
  } catch (cause) {
    console.error(cause.message)
    process.exitCode = 1
  }
}
