/** منطق مشترك لاختيار المرفقات (نص/صورة/PDF) بين نموذج التقرير والإضافة السريعة. */
import { useState } from 'react';
import type { AttachmentKind } from '@/domain/types';
import { APP_CONFIG } from '@/config';
import { classifyFile, readAsDataUrl, textToDataUrl } from '@/utils/file';
import { todayKey } from '@/utils/date';
import { useToast } from '@/ui/components/ui';

export interface PendingAttachment {
  name: string;
  kind: AttachmentKind;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export function usePendingAttachments() {
  const toast = useToast();
  const [pending, setPending] = useState<PendingAttachment[]>([]);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const added: PendingAttachment[] = [];
    for (const file of Array.from(files)) {
      const kind = classifyFile(file);
      if (!kind) {
        toast(`النوع غير مدعوم: ${file.name}`, 'error');
        continue;
      }
      if (file.size > APP_CONFIG.maxAttachmentBytes) {
        toast(`الملف كبير جداً: ${file.name}`, 'error');
        continue;
      }
      try {
        added.push({
          name: file.name,
          kind,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl: await readAsDataUrl(file),
        });
      } catch {
        toast(`تعذّرت قراءة ${file.name}`, 'error');
      }
    }
    setPending((current) => [...current, ...added]);
  };

  const addNote = (text: string) => {
    if (!text.trim()) return false;
    setPending((current) => [...current, {
      name: `ملاحظة-${todayKey()}-${current.length + 1}.txt`,
      kind: 'text',
      mimeType: 'text/plain',
      size: new TextEncoder().encode(text).length,
      dataUrl: textToDataUrl(text),
    }]);
    return true;
  };

  const remove = (index: number) =>
    setPending((current) => current.filter((_, itemIndex) => itemIndex !== index));

  const clear = () => setPending([]);

  return { pending, addFiles, addNote, remove, clear };
}
