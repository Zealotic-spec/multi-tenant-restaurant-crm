"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { getPeakHours, getFeedback, type PeakHour, type FeedbackItem } from "@/lib/api";
import PeakHoursChart from "@/components/charts/PeakHoursChart";

export default function MarketingPage() {
  const [hours, setHours] = useState<PeakHour[]>([]);
  const [feedbackData, setFeedbackData] = useState<{
    feedback: FeedbackItem[];
    avg_rating: number;
    total: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getPeakHours(), getFeedback()])
      .then(([h, f]) => {
        setHours(h.hours);
        setFeedbackData(f);
      })
      .finally(() => setLoading(false));
  }, []);

  const avgRating = feedbackData?.avg_rating ?? 0;

  function StarRating({ rating }: { rating: number }) {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            size={12}
            className={s <= rating ? "text-amber-400 fill-amber-400" : "text-zinc-700"}
          />
        ))}
      </div>
    );
  }

  if (loading) return (
    <div className="p-6 space-y-4">
      <div className="h-8 w-48 bg-zinc-800 rounded-lg animate-pulse" />
      <div className="h-72 bg-zinc-900 border border-zinc-800 rounded-2xl animate-pulse" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Маркетинг и Гости</h1>
        <p className="text-zinc-400 text-sm mt-0.5">Пиковые часы и обратная связь</p>
      </div>

      {/* Метрики */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <p className="text-zinc-400 text-sm mb-2">Средняя оценка</p>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-white">{avgRating.toFixed(1)}</span>
            <span className="text-amber-400 text-lg mb-0.5">/ 5</span>
          </div>
          <div className="mt-2">
            <StarRating rating={Math.round(avgRating)} />
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <p className="text-zinc-400 text-sm mb-2">Всего отзывов</p>
          <p className="text-3xl font-bold text-white">{feedbackData?.total ?? 0}</p>
          <p className="text-zinc-500 text-xs mt-1">за всё время</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <p className="text-zinc-400 text-sm mb-2">Пиковый час</p>
          {hours.length > 0 ? (() => {
            const peak = hours.reduce((a, b) => a.guests_count >= b.guests_count ? a : b);
            return (
              <>
                <p className="text-3xl font-bold text-white">
                  {String(peak.hour).padStart(2, "0")}:00
                </p>
                <p className="text-zinc-500 text-xs mt-1">{peak.guests_count} гостей в среднем</p>
              </>
            );
          })() : <p className="text-2xl font-bold text-zinc-600">—</p>}
        </div>
      </div>

      {/* График пиковых часов */}
      {hours.length > 0 && <PeakHoursChart data={hours} />}

      {/* Отзывы */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h3 className="text-white font-semibold mb-4">Последние отзывы</h3>
        <div className="space-y-3">
          {(feedbackData?.feedback ?? []).slice(0, 10).map((item) => (
            <div key={item.id} className="flex gap-4 p-3 bg-zinc-800/50 rounded-xl">
              <div className="w-9 h-9 rounded-full bg-indigo-600/20 flex items-center justify-center text-sm font-medium text-indigo-400 flex-shrink-0">
                {(item.guest_name ?? "G").charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white text-sm font-medium truncate">
                    {item.guest_name ?? "Гость"}
                  </span>
                  <StarRating rating={item.rating} />
                </div>
                {item.comment && (
                  <p className="text-zinc-400 text-sm mt-1 line-clamp-2">{item.comment}</p>
                )}
                <p className="text-zinc-600 text-xs mt-1">
                  {new Date(item.created_at).toLocaleDateString("ru")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
