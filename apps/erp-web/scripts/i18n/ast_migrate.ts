import { Project, Node, SyntaxKind, ObjectLiteralExpression, PropertyAssignment } from 'ts-morph'
import fs from 'fs'
import path from 'path'

const TARGET_DIR = 'src/components/dashboard'
const USER_FACING_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt', 'label', 'emptyState', 'description', 'tooltip']

const project = new Project({
  tsConfigFilePath: 'tsconfig.app.json',
})

const isCyrillic = (text: string) => /[а-яА-ЯЁё]/.test(text)

function generateKey(filePath: string, text: string): string {
  let relPath = path.relative(path.join(process.cwd(), 'src'), filePath)
  relPath = relPath.replace(/\.tsx?$/, '')
  const parts = relPath.split(path.sep).filter(p => p !== 'components' && p !== 'pages' && p !== 'features')
  if (parts.length > 0) {
    const last = parts[parts.length - 1]
    parts[parts.length - 1] = last.charAt(0).toLowerCase() + last.slice(1)
  }
  const namespace = parts.join('.')
  // For migration, we try to create a clean slug
  let slug = text.trim().replace(/[^a-zA-Zа-яА-Я0-9]+/g, '_').substring(0, 20).toLowerCase()
  slug = slug.replace(/^_+|_+$/g, '')
  return `${namespace}.${slug || 'text'}`
}

function deepAddProperty(objExpr: ObjectLiteralExpression, keyPath: string[], value: string) {
  const currentKey = keyPath[0]
  const isLast = keyPath.length === 1

  const prop = objExpr.getProperties().find(p => {
    if (Node.isPropertyAssignment(p)) {
      const name = p.getName().replace(/^['"]|['"]$/g, '')
      return name === currentKey
    }
    return false
  })
  
  if (!prop) {
    if (isLast) {
      objExpr.addPropertyAssignment({ name: `"${currentKey}"`, initializer: JSON.stringify(value) })
    } else {
      const newProp = objExpr.addPropertyAssignment({ name: `"${currentKey}"`, initializer: `{}` })
      const nestedObj = newProp.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression)
      deepAddProperty(nestedObj, keyPath.slice(1), value)
    }
  } else {
    if (Node.isPropertyAssignment(prop)) {
      const init = prop.getInitializer()
      if (isLast) {
        // Skip if already exists
      } else if (Node.isObjectLiteralExpression(init)) {
        deepAddProperty(init, keyPath.slice(1), value)
      }
    }
  }
}

async function migrate() {
  // Use ts-morph to find JSX files in src
  project.addSourceFilesAtPaths('src/**/*.tsx')
  const sourceFiles = project.getSourceFiles()
  console.log(`Migrating ${sourceFiles.length} files in src/...`)
  
  const ruFile = project.getSourceFile('src/i18n/dictionaries/ru.ts')
  if (!ruFile) throw new Error('ru.ts not found')
  
  const ruDecl = ruFile.getVariableDeclaration('ru')
  if (!ruDecl) throw new Error('Could not find variable declaration ru')
  let ruExportNode = ruDecl.getInitializer()
  if (Node.isAsExpression(ruExportNode) || Node.isTypeAssertion(ruExportNode)) {
    ruExportNode = ruExportNode.getExpression()
  }
  const ruExport = Node.isObjectLiteralExpression(ruExportNode) ? ruExportNode : undefined
  if (!ruExport) {
    throw new Error(`ru has initializer of kind: ${ruExportNode?.getKindName()}`)
  }

  let totalMigrated = 0
  const modifiedFiles = new Set<string>()

  for (const sf of sourceFiles) {
    let needsI18n = false
    let hasT = false

    // Check if useI18n is already imported
    const importDecls = sf.getImportDeclarations()
    const i18nImport = importDecls.find(id => id.getModuleSpecifierValue() === '@/i18n')
    if (i18nImport) {
      if (i18nImport.getNamedImports().some(ni => ni.getName() === 'useI18n')) {
        needsI18n = true // It's already there, so we might have `t`
      }
    }

    // Find main component function to inject `const { t } = useI18n()`
    // Simple heuristic: default export or first exported function that returns JSX
    const functions = sf.getFunctions()
    const arrowFunctions = sf.getDescendantsOfKind(SyntaxKind.ArrowFunction)
    const components = [...functions, ...arrowFunctions].filter(f => {
      // Very basic check: does it have JSX inside?
      return f.getDescendantsOfKind(SyntaxKind.JsxElement).length > 0 || f.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0
    })

    const mainComponent = components[0] // pick the first one

    // If we have a component, we can inject
    if (mainComponent) {
      // check if it already has `const { t } = useI18n()`
      const statements = Node.isFunctionDeclaration(mainComponent) ? mainComponent.getBody()?.asKind(SyntaxKind.Block)?.getStatements() :
                         Node.isArrowFunction(mainComponent) ? mainComponent.getBody()?.asKind(SyntaxKind.Block)?.getStatements() : null

      if (statements) {
        hasT = statements.some(s => s.getText().includes('useI18n()'))
      }
    }

    let fileChanged = false
    const nodesToReplaceJsxText: Array<{node: Node, key: string, text: string}> = []
    const nodesToReplaceAttr: Array<{node: Node, key: string, text: string}> = []

    sf.forEachDescendant((node: Node) => {
      // 1. JsxText
      if (Node.isJsxText(node)) {
        const text = node.getLiteralText()
        if (text.trim() && isCyrillic(text) && !text.includes('{') && !text.includes('}')) {
          const key = generateKey(sf.getFilePath(), text.trim())
          nodesToReplaceJsxText.push({ node, key, text: text.trim() })
        }
      }
      
      // 2. Attributes
      if (Node.isJsxAttribute(node) && node.getKind() === SyntaxKind.JsxAttribute) {
        const name = node.getNameNode().getText()
        if (USER_FACING_ATTRIBUTES.includes(name)) {
          const init = node.getInitializer()
          if (Node.isStringLiteral(init)) {
            const text = init.getLiteralValue()
            if (text.trim() && isCyrillic(text)) {
              const key = generateKey(sf.getFilePath(), text.trim())
              nodesToReplaceAttr.push({ node: init, key, text: text.trim() })
            }
          }
        }
      }
    })

    const functionsToInjectT = new Set<Node>()

    for (const item of nodesToReplaceJsxText) {
      deepAddProperty(ruExport, item.key.split('.'), item.text)

      const func = item.node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) || 
                   item.node.getFirstAncestorByKind(SyntaxKind.ArrowFunction) ||
                   item.node.getFirstAncestorByKind(SyntaxKind.FunctionExpression)
      if (func) functionsToInjectT.add(func)

      item.node.replaceWithText(`{t('${item.key}')}`)
      fileChanged = true
      needsI18n = true
      totalMigrated++
    }

    for (const item of nodesToReplaceAttr) {
      deepAddProperty(ruExport, item.key.split('.'), item.text)

      const func = item.node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) || 
                   item.node.getFirstAncestorByKind(SyntaxKind.ArrowFunction) ||
                   item.node.getFirstAncestorByKind(SyntaxKind.FunctionExpression)
      if (func) functionsToInjectT.add(func)

      item.node.replaceWithText(`{t('${item.key}')}`)
      fileChanged = true
      needsI18n = true
      totalMigrated++
    }

    if (fileChanged) {
      modifiedFiles.add(sf.getFilePath())
      if (needsI18n) {
        // Inject import if missing
        if (!i18nImport) {
          sf.addImportDeclaration({
            namedImports: ['useI18n'],
            moduleSpecifier: '@/i18n'
          })
        } else {
          const hasUseI18n = i18nImport.getNamedImports().some(ni => ni.getName() === 'useI18n')
          if (!hasUseI18n) {
            i18nImport.addNamedImport('useI18n')
          }
        }

        // Inject const { t } = useI18n()
        for (const func of functionsToInjectT) {
          const body = Node.isFunctionDeclaration(func) ? func.getBody() :
                       Node.isArrowFunction(func) ? func.getBody() :
                       Node.isFunctionExpression(func) ? func.getBody() : null

          if (body && Node.isBlock(body)) {
            const hasT = body.getStatements().some(s => s.getText().includes('useI18n()'))
            if (!hasT) {
              body.insertStatements(0, 'const { t } = useI18n();')
            }
          }
        }
      }
    }
  }

  console.log(`Migrated ${totalMigrated} strings in ${modifiedFiles.size} files.`)
  if (modifiedFiles.size > 0) {
    // Generate diff backup
    const backupDir = path.join(process.cwd(), 'migration_backup')
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir)
    
    // Just saving project saves everything
    await project.save()
    console.log('Saved changes to disk.')
  }
}

migrate().catch(console.error)
