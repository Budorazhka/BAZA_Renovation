import { Project, Node, SyntaxKind, JsxElement, JsxSelfClosingElement, JsxText, JsxExpression, StringLiteral, TemplateExpression } from 'ts-morph'
import fs from 'fs'
import path from 'path'

const project = new Project({
  tsConfigFilePath: 'tsconfig.app.json',
})

const USER_FACING_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt', 'label', 'emptyState', 'description', 'tooltip']

type FindingCategory = 'JsxText' | 'JsxAttribute' | 'Interpolation' | 'Unknown'

interface AuditFinding {
  file: string
  line: number
  text: string
  category: FindingCategory
  suggestedKey: string
  isCyrillic: boolean
}

const isCyrillic = (text: string) => /[а-яА-ЯЁё]/.test(text)

function generateKey(filePath: string, text: string): string {
  // src/components/dashboard/widgets/WidgetDevFunnel.tsx -> dashboard.widgets.devFunnel
  let relPath = path.relative(path.join(process.cwd(), 'src'), filePath)
  relPath = relPath.replace(/\.tsx?$/, '')
  const parts = relPath.split(path.sep).filter(p => p !== 'components' && p !== 'pages' && p !== 'features')
  
  // Convert filename to camelCase if it's PascalCase
  if (parts.length > 0) {
    const last = parts[parts.length - 1]
    parts[parts.length - 1] = last.charAt(0).toLowerCase() + last.slice(1)
  }
  
  const namespace = parts.join('.')
  
  // Simple hash or transliteration for the key itself
  // For audit, we just append a short hash of the text or a slug
  const cleanText = text.trim().replace(/[^a-zA-Zа-яА-Я0-9]+/g, '_').substring(0, 20).toLowerCase()
  return `${namespace}.${cleanText || 'text'}`
}

const findings: AuditFinding[] = []

function auditFile(sourceFile: any) {
  const filePath = sourceFile.getFilePath()
  
  // Ignore tests, stories, definitions
  if (filePath.includes('.test.') || filePath.includes('.spec.') || filePath.includes('.d.ts')) return

  sourceFile.forEachDescendant((node: Node) => {
    // 1. JsxText
    if (Node.isJsxText(node)) {
      const text = node.getLiteralText()
      if (text.trim() && !/^[0-9\s\W]+$/.test(text)) {
        // Contains actual words
        const cyrillic = isCyrillic(text)
        // If it's pure English, it might be a component like <Icon name="check" /> but JsxText is children: <Button>Submit</Button>. 
        // We capture it.
        findings.push({
          file: filePath,
          line: node.getStartLineNumber(),
          text: text.trim(),
          category: 'JsxText',
          suggestedKey: generateKey(filePath, text),
          isCyrillic: cyrillic
        })
      }
    }
    
    // 2. Attributes
    if (Node.isJsxAttribute(node) && node.getKind() === SyntaxKind.JsxAttribute) {
      const name = node.getNameNode().getText()
      if (USER_FACING_ATTRIBUTES.includes(name)) {
        const init = node.getInitializer()
        if (Node.isStringLiteral(init)) {
          const text = init.getLiteralValue()
          if (text.trim() && !/^[0-9\s\W]+$/.test(text)) {
            findings.push({
              file: filePath,
              line: node.getStartLineNumber(),
              text: text.trim(),
              category: 'JsxAttribute',
              suggestedKey: generateKey(filePath, text),
              isCyrillic: isCyrillic(text)
            })
          }
        } else if (Node.isJsxExpression(init)) {
          const expr = init.getExpression()
          if (Node.isTemplateExpression(expr) || Node.isBinaryExpression(expr) || Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr)) {
            // Complex expression in attribute
            const text = expr.getText()
            if (isCyrillic(text)) {
              findings.push({
                file: filePath,
                line: node.getStartLineNumber(),
                text: text.trim(),
                category: 'Interpolation',
                suggestedKey: generateKey(filePath, 'dynamic_attr'),
                isCyrillic: true
              })
            }
          }
        }
      }
    }

    // 3. JsxExpression (Interpolation inside JSX children)
    if (Node.isJsxExpression(node)) {
      const parent = node.getParent()
      // Only care if it's a child of an element, not an attribute
      if (Node.isJsxElement(parent) || Node.isJsxFragment(parent)) {
        const expr = node.getExpression()
        if (expr) {
          const text = expr.getText()
          if (isCyrillic(text)) {
            // Further analysis could check if it's a template literal or string concat
            if (Node.isTemplateExpression(expr) || Node.isBinaryExpression(expr) || Node.isStringLiteral(expr) || Node.isNoSubstitutionTemplateLiteral(expr)) {
               findings.push({
                file: filePath,
                line: node.getStartLineNumber(),
                text: text.trim(),
                category: 'Interpolation',
                suggestedKey: generateKey(filePath, 'dynamic_text'),
                isCyrillic: true
              })
            }
          }
        }
      }
    }
  })
}

const sourceFiles = project.getSourceFiles('src/**/*.tsx')
console.log(`Auditing ${sourceFiles.length} files...`)

for (const sf of sourceFiles) {
  auditFile(sf)
}

const cyrillicFindings = findings.filter(f => f.isCyrillic)
const totalCyrillic = cyrillicFindings.length
const totalOther = findings.length - totalCyrillic

console.log(`\nAudit Complete!`)
console.log(`Found ${totalCyrillic} Cyrillic strings and ${totalOther} other potential hardcoded strings.`)

// Save full report
fs.writeFileSync('i18n_audit_report.json', JSON.stringify(findings, null, 2))
console.log('Saved detailed report to i18n_audit_report.json')

// Save todo translations (extract unique keys/texts)
const todoList = cyrillicFindings.reduce((acc, f) => {
  if (!acc[f.suggestedKey]) {
    acc[f.suggestedKey] = f.text
  }
  return acc
}, {} as Record<string, string>)

fs.writeFileSync('todo_translations.json', JSON.stringify(todoList, null, 2))
console.log(`Saved ${Object.keys(todoList).length} unique translation keys to todo_translations.json`)
