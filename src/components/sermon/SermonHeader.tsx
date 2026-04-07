import { useTranslation } from 'react-i18next';

interface SermonHeaderProps {
  date: string;
  pastor: string;
  topic: string;
  bibleRef: string;
  onPastorChange: (v: string) => void;
  onTopicChange: (v: string) => void;
  onBibleRefChange: (v: string) => void;
  onBibleRefCommit?: (v: string) => void;
}

export function SermonHeader({
  date,
  pastor,
  topic,
  bibleRef,
  onPastorChange,
  onTopicChange,
  onBibleRefChange,
  onBibleRefCommit,
}: SermonHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl bg-amber-50/50 border border-amber-100/60 px-4 py-3 space-y-1">
      {/* Date */}
      <div>
        <span className="text-base uppercase tracking-widest text-amber-600 font-semibold">{t('sermon.dateLabel')}</span>
        <div className="text-base font-semibold text-black mt-0.5">{date}</div>
      </div>

      {/* Topic — largest field */}
      <div>
        <span className="text-base uppercase tracking-widest text-amber-600 font-semibold">{t('sermon.topicLabel')}</span>
        <input
          type="text"
          value={topic}
          onChange={(e) => onTopicChange(e.target.value)}
          placeholder={t('sermon.topic')}
          className="w-full text-base font-semibold text-black placeholder-stone-300 bg-transparent outline-none mt-0.5"
        />
      </div>

      {/* Pastor + Bible Ref on same row */}
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          <span className="text-base uppercase tracking-widest text-amber-600 font-semibold">{t('sermon.pastorLabel')}</span>
          <input
            type="text"
            value={pastor}
            onChange={(e) => onPastorChange(e.target.value)}
            placeholder={t('sermon.pastor')}
            className="w-full text-base text-black placeholder-stone-300 bg-transparent outline-none mt-0.5"
          />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-base uppercase tracking-widest text-amber-600 font-semibold">{t('sermon.bibleRefLabel')}</span>
          <input
            type="text"
            value={bibleRef}
            onChange={(e) => onBibleRefChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && onBibleRefCommit) onBibleRefCommit(bibleRef); }}
            onBlur={() => { if (onBibleRefCommit) onBibleRefCommit(bibleRef); }}
            placeholder={t('sermon.bibleRef')}
            className="w-full text-base text-black placeholder-stone-300 bg-transparent outline-none mt-0.5"
          />
        </div>
      </div>
    </div>
  );
}
