import { useId, useState } from "react";
import type { TranslationDict } from "../../app/i18n";
import { ResponsiveDialog } from "./ui/ResponsiveDialog";
import styles from "./ui/ResponsiveDialog.module.css";

interface UserGuideModalProps {
  t: TranslationDict;
  onClose: () => void;
}

type GuideTabId = "intro" | "setup" | "view" | "play" | "tools";

export function UserGuideModal({ t, onClose }: UserGuideModalProps) {
  const [activeTab, setActiveTab] = useState<GuideTabId>("intro");
  const titleId = useId();
  const tabPrefix = useId();
  const panelId = `${tabPrefix}-panel-${activeTab}`;

  const tabs: Array<{ id: GuideTabId; label: string; icon: string }> = [
    {
      id: "intro",
      label: t.guideIntroMenu,
      icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    },
    {
      id: "setup",
      label: t.guideSetupMenu,
      icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
    },
    {
      id: "view",
      label: t.guideViewMenu,
      icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
    },
    {
      id: "play",
      label: t.guidePlayMenu,
      icon: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    },
    {
      id: "tools",
      label: t.guideToolsMenu,
      icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    },
  ];

  return (
    <ResponsiveDialog
      onClose={onClose}
      titleId={titleId}
      size="large"
      height="medium"
    >
      <div className={styles.guideLayout}>
        <aside className={styles.guideSidebar}>
          <h2 className={styles.guideTitle} id={titleId}>
            {t.guideTitle}
          </h2>
          <div
            className={styles.guideTabs}
            role="tablist"
            aria-label={t.guideTitle}
            onKeyDown={(event) => {
              if (
                event.key !== "ArrowLeft" &&
                event.key !== "ArrowRight" &&
                event.key !== "ArrowUp" &&
                event.key !== "ArrowDown" &&
                event.key !== "Home" &&
                event.key !== "End"
              ) {
                return;
              }
              event.preventDefault();
              const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
              const movesForward =
                event.key === "ArrowRight" || event.key === "ArrowDown";
              const nextIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : movesForward
                      ? (currentIndex + 1) % tabs.length
                      : (currentIndex - 1 + tabs.length) % tabs.length;
              const nextTab = tabs[nextIndex];
              setActiveTab(nextTab.id);
              window.requestAnimationFrame(() =>
                document.getElementById(`${tabPrefix}-tab-${nextTab.id}`)?.focus(),
              );
            }}
          >
            {tabs.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  className={`${styles.tabButton}${selected ? ` ${styles.activeTab}` : ""}`}
                  type="button"
                  role="tab"
                  id={`${tabPrefix}-tab-${tab.id}`}
                  aria-controls={`${tabPrefix}-panel-${tab.id}`}
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  data-dialog-autofocus={selected ? "true" : undefined}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <svg
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                    {tab.id === "setup" && (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    )}
                  </svg>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </aside>

        <div
          className={styles.guideContent}
          id={panelId}
          role="tabpanel"
          aria-labelledby={`${tabPrefix}-tab-${activeTab}`}
          tabIndex={0}
        >
          <button
            className={`${styles.closeButton} ${styles.guideClose}`}
            type="button"
            onClick={onClose}
            aria-label="Đóng hướng dẫn / Close guide"
          >
            <svg
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {activeTab === "intro" && (
            <section className={styles.guideSection}>
              <div className={styles.guideHero} aria-hidden="true">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 32 32"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M 26 12 A 11 11 0 1 1 20 6" />
                  <path
                    d="M 16 9 L 18 14 L 23 16 L 18 18 L 16 23 L 14 18 L 9 16 L 14 14 Z"
                    fill="white"
                  />
                </svg>
              </div>
              <h1>{t.guideIntroTitle}</h1>
              <p>{t.guideIntroDesc}</p>
            </section>
          )}

          {activeTab === "setup" && (
            <section className={styles.guideSection}>
              <h1>{t.guideSetupTitle}</h1>
              <div className={styles.guideCards}>
                <article className={styles.guideCard}>
                  <strong>1. Import</strong>
                  <p>{t.guideSetupFile}</p>
                </article>
                <article className={styles.guideCard}>
                  <strong>2. Profile Configuration</strong>
                  <p>{t.guideSetupProfile}</p>
                </article>
              </div>
            </section>
          )}

          {activeTab === "view" && (
            <section className={styles.guideSection}>
              <h1>{t.guideViewTitle}</h1>
              <ul className={styles.guideCards}>
                <li className={styles.guideCard}>
                  <strong>📐 2D Milling Plane</strong>
                  <span>{t.guideView2D}</span>
                </li>
                <li className={styles.guideCard}>
                  <strong>📦 3D Simulation</strong>
                  <span>{t.guideView3D}</span>
                </li>
                <li className={styles.guideCard}>
                  <strong>🪵 3D Solid</strong>
                  <span>{t.guideViewSolid}</span>
                </li>
              </ul>
            </section>
          )}

          {activeTab === "play" && (
            <section className={styles.guideSection}>
              <h1>{t.guidePlayTitle}</h1>
              <div className={styles.guideCard}>
                <p>{t.guidePlayDesc}</p>
              </div>
            </section>
          )}

          {activeTab === "tools" && (
            <section className={styles.guideSection}>
              <h1>{t.guideToolsTitle}</h1>
              <ul className={styles.guideToolsGrid}>
                {[
                  t.guideToolsErrors,
                  t.guideToolsParts,
                  t.guideToolsMER,
                  t.guideToolsRecovery,
                  t.guideToolsPost,
                ].map((description) => (
                  <li className={styles.guideCard} key={description}>
                    {description}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </ResponsiveDialog>
  );
}
