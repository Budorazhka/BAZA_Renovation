export const rules = {
  'no-cyrillic-jsx': {
    meta: {
      type: 'suggestion',
      docs: {
        description: 'Disallow hardcoded Cyrillic text in JSX',
        category: 'Best Practices',
        recommended: false,
      },
      schema: [], // no options
      messages: {
        unexpectedCyrillic: 'Hardcoded Cyrillic text "{{text}}" is not allowed in JSX. Use useI18n() instead.',
      },
    },
    create(context) {
      const cyrillicRegex = /[А-Яа-яЁё]/;

      // Attributes to ignore, similar to the AST audit script
      const ignoredAttributes = [
        'className', 'id', 'name', 'type', 'key', 'ref', 'href', 'src',
        'width', 'height', 'style', 'color', 'd', 'viewBox', 'fill',
        'xmlns', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin',
        'data-*', 'aria-hidden'
      ];

      return {
        JSXText(node) {
          const text = node.value.trim();
          if (text && cyrillicRegex.test(text)) {
            context.report({
              node,
              messageId: 'unexpectedCyrillic',
              data: { text },
            });
          }
        },
        JSXAttribute(node) {
          const attrName = node.name.name;
          
          if (typeof attrName !== 'string') return;
          
          if (ignoredAttributes.includes(attrName) || attrName.startsWith('data-')) {
            return;
          }

          if (node.value && node.value.type === 'Literal') {
            const text = node.value.value;
            if (typeof text === 'string' && cyrillicRegex.test(text)) {
              context.report({
                node: node.value,
                messageId: 'unexpectedCyrillic',
                data: { text },
              });
            }
          }
        },
        Literal(node) {
          // Check if literal is inside a JSXExpressionContainer
          // e.g. <div title={"Русский текст"} /> or <div>{"Русский текст"}</div>
          if (node.parent && node.parent.type === 'JSXExpressionContainer') {
            const text = node.value;
            if (typeof text === 'string' && cyrillicRegex.test(text)) {
              // We could add more checks to see if this is an ignored attribute
              // But for simplicity, warn on any cyrillic literal inside JSXExpressionContainer
              if (node.parent.parent && node.parent.parent.type === 'JSXAttribute') {
                const attrName = node.parent.parent.name.name;
                if (typeof attrName === 'string' && (ignoredAttributes.includes(attrName) || attrName.startsWith('data-'))) {
                  return;
                }
              }

              context.report({
                node,
                messageId: 'unexpectedCyrillic',
                data: { text },
              });
            }
          }
        }
      };
    },
  },
};
