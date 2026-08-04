import { useId, useMemo, useState } from "react";
import * as Diff from "diff";
import type { TranslationDict } from "../../app/i18n";
import { Icon } from "./ui/Icon";
import { ResponsiveDialog } from "./ui/ResponsiveDialog";
import styles from "./ui/ResponsiveDialog.module.css";

interface FileCompareModalProps {
  t: TranslationDict;
  currentCode: string;
  onClose: () => void;
  onApply: (code: string) => void;
}

export function FileCompareModal({
  currentCode,
  onClose,
  onApply,
}: FileCompareModalProps) {
  const [originalCode, setOriginalCode] = useState("");
  const [modifiedCode, setModifiedCode] = useState(currentCode);
  const titleId = useId();
  const fileInputId = useId();

  const diffResult = useMemo(
    () => Diff.diffLines(originalCode, modifiedCode),
    [originalCode, modifiedCode],
  );

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      if (typeof loadEvent.target?.result === "string") {
        setOriginalCode(loadEvent.target.result);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  return (
    <ResponsiveDialog onClose={onClose} titleId={titleId} size="wide" height="tall">
      <header className={styles.header}>
        <h2
          className={`${styles.heading} ${styles.headingWithIcon}`}
          id={titleId}
        >
          <Icon
            name="compare"
            size={20}
            fallback="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
          />
          File Compare
        </h2>
        <button
          className={styles.closeButton}
          type="button"
          onClick={onClose}
          data-dialog-autofocus
          aria-label="Đóng so sánh tệp / Close file comparison"
        >
          <Icon name="x" size={24} fallback="M6 18L18 6M6 6l12 12" />
        </button>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <label htmlFor={fileInputId}>Tệp gốc (Original File)</label>
          <input
            id={fileInputId}
            type="file"
            accept=".nc,.txt,.tap,.gcode,.cnc"
            onChange={handleFileUpload}
          />
        </div>
        <div className={styles.toolbarSpacer} />
        <button
          type="button"
          onClick={() => onApply(modifiedCode)}
          className={styles.primaryButton}
        >
          Lưu thay đổi (Apply)
        </button>
      </div>

      <div className={styles.compareBody}>
        <section className={styles.comparePane} aria-labelledby={`${titleId}-modified`}>
          <div className={styles.paneHeader} id={`${titleId}-modified`}>
            Tệp hiện tại (Modified)
          </div>
          <textarea
            className={styles.compareEditor}
            value={modifiedCode}
            onChange={(event) => setModifiedCode(event.target.value)}
            aria-label="Nội dung tệp hiện tại / Modified file content"
            spellCheck={false}
          />
        </section>

        <section
          className={`${styles.comparePane} ${styles.diffPane}`}
          aria-labelledby={`${titleId}-result`}
        >
          <div className={styles.paneHeader} id={`${titleId}-result`}>
            <span>Kết quả so sánh</span>
            <span className={styles.addedLegend}>+ Thêm</span>
            <span className={styles.removedLegend}>- Xóa</span>
          </div>
          <div
            className={styles.diffViewer}
            role="region"
            aria-label="Kết quả diff / Difference result"
            tabIndex={0}
          >
            {diffResult.map((part, index) => {
              const partClassName = part.added
                ? styles.diffAdded
                : part.removed
                  ? styles.diffRemoved
                  : styles.diffUnchanged;

              return (
                <span key={index} className={partClassName}>
                  {part.value}
                </span>
              );
            })}
          </div>
        </section>
      </div>
    </ResponsiveDialog>
  );
}
