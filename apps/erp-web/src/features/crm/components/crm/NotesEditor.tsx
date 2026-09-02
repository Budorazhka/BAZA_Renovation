import { useState, useRef, useCallback } from 'react';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { Bold, Heading1, Heading2, List, Quote, Minus, ChevronDown, Table2, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/i18n';

interface NotesEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

const TOOLBAR_ITEMS = [
  { icon: Heading1, labelKey: 'notesEditor.heading1', label: 'H1', insert: '# ', newline: true },
  { icon: Heading2, labelKey: 'notesEditor.heading2', label: 'H2', insert: '## ', newline: true },
  { icon: Bold, labelKey: 'notesEditor.bold', label: 'Bold', insert: '**', wrap: true },
  { icon: Quote, labelKey: 'notesEditor.quote', label: 'Quote', insert: '> ', newline: true },
  { icon: List, labelKey: 'notesEditor.list', label: 'List', insert: '- ', newline: true },
  { icon: Minus, labelKey: 'notesEditor.hr', label: 'HR', insert: '---\n', newline: false },
  { icon: Table2, labelKey: 'notesEditor.table', label: 'Table', insert: '| Column 1 | Column 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |\n', newline: true },
];

const DETAILS_TEMPLATE = `<details>\n<summary>Section Title</summary>\n\n- **Key:** Value\n\n</details>\n`;

export function NotesEditor({ value, onChange, onSave, onCancel, isSaving }: NotesEditorProps) {
  const { t } = useI18n();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleInsert = useCallback((insert: string, wrap?: boolean, newline?: boolean) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.substring(start, end);
    let newText: string;
    let newCursorPos: number;

    if (wrap) {
      newText = value.substring(0, start) + insert + selected + insert + value.substring(end);
      newCursorPos = start + insert.length + selected.length + insert.length;
    } else if (newline) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      newText = value.substring(0, lineStart) + insert + value.substring(lineStart);
      newCursorPos = start + insert.length - (start - lineStart);
    } else {
      newText = value.substring(0, start) + insert + value.substring(end);
      newCursorPos = start + insert.length;
    }

    onChange(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = newCursorPos;
      textarea.selectionEnd = newCursorPos;
    }, 0);
  }, [value, onChange]);

  const handleInsertDetails = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const beforeCursor = value.substring(0, start);
    const prefix = beforeCursor.endsWith('\n') || beforeCursor === '' ? '' : '\n';
    const newText = value.substring(0, start) + prefix + DETAILS_TEMPLATE + value.substring(start);
    const newCursorPos = start + prefix.length + DETAILS_TEMPLATE.length;

    onChange(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = newCursorPos;
      textarea.selectionEnd = newCursorPos;
    }, 0);
  }, [value, onChange]);

  return (
    <div className="notes-editor-container">
      {/* AI Warning Banner */}
      <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10">
        <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
        <span className="text-amber-300 text-sm">
          {t('notesEditor.aiWarning')}
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 mb-2 p-1.5 rounded-lg bg-[#0d2818] border border-[#1e4a2a]">
        {TOOLBAR_ITEMS.map((item) => (
          <button
            key={item.label}
            onClick={() => handleInsert(item.insert, item.wrap, item.newline)}
            className="p-1.5 rounded-md hover:bg-[#163824] transition-colors text-white/70 hover:text-white"
            title={t(item.labelKey)}
            type="button"
          >
            <item.icon size={16} />
          </button>
        ))}
        <button
          onClick={handleInsertDetails}
          className="p-1.5 rounded-md hover:bg-[#163824] transition-colors text-white/70 hover:text-white flex items-center gap-1"
          title={t('notesEditor.detailsTitle')}
          type="button"
        >
          <ChevronDown size={14} />
          <span className="text-xs">{t('notesEditor.detailsLabel')}</span>
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            showPreview
              ? 'bg-[#c9a84c] text-[#031712]'
              : 'bg-[#163824] text-white/70 hover:text-white hover:bg-[#1e4a2a]'
          }`}
          type="button"
        >
          {showPreview ? t('notesEditor.edit') : t('notesEditor.preview')}
        </button>
      </div>

      {/* Editor / Preview */}
      <div className="relative rounded-lg border border-[#1e4a2a] bg-[#0d2818] overflow-hidden">
        {showPreview ? (
          <div className="p-3 min-h-[200px] max-h-[400px] overflow-y-auto crm-lead-notes">
            {value ? (
              <Markdown rehypePlugins={[rehypeRaw]}>{value}</Markdown>
            ) : (
              <span className="text-white/40 italic">{t('notesEditor.empty')}</span>
            )}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full p-3 bg-transparent text-white/90 font-mono text-sm leading-relaxed resize-none focus:outline-none min-h-[200px] max-h-[400px]"
            placeholder={t('notesEditor.placeholder')}
            spellCheck={false}
          />
        )}
      </div>

      {/* Char count */}
      <div className="flex justify-between items-center mt-2 text-xs text-white/30">
        <span>{value.length} {t('notesEditor.chars')}</span>
        <span>{t('notesEditor.formatHint')}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={onSave}
          disabled={isSaving}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            isSaving
              ? 'bg-white/10 text-white/40 cursor-not-allowed'
              : 'bg-[#c9a84c] text-[#031712] hover:bg-[#e6c364] cursor-pointer'
          }`}
          type="button"
        >
          {isSaving ? t('notesEditor.saving') : t('notesEditor.save')}
        </button>
        <button
          onClick={onCancel}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg font-medium text-sm border border-[#1e4a2a] text-white/70 hover:bg-[#163824] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
        >
          {t('notesEditor.cancel')}
        </button>
      </div>
    </div>
  );
}
