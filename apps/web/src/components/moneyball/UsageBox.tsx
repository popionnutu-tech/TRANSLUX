export function UsageBox({
  title,
  what,
  howToUse,
}: {
  title: string;
  what: string;
  howToUse: string[];
}) {
  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
      <div className="text-sm font-semibold text-indigo-900">{title}</div>
      <p className="text-sm text-indigo-800 mt-1.5 leading-relaxed">{what}</p>
      <div className="mt-3">
        <div className="text-xs font-semibold uppercase text-indigo-700 mb-1.5">Cum folosești</div>
        <ul className="text-sm text-indigo-800 space-y-1">
          {howToUse.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-indigo-400">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
