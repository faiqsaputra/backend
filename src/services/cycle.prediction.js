const MIN_CYCLE_LENGTH = 15;
const MAX_CYCLE_LENGTH = 90;

function toUtcDate(value) {
  const date = String(value).slice(0, 10);
  const [year, month, day] = date.split('-').map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = toUtcDate(dateString);
  date.setUTCDate(date.getUTCDate() + days);

  return formatDate(date);
}

function differenceInDays(start, end) {
  return Math.round(
    (toUtcDate(end).getTime() - toUtcDate(start).getTime()) / 86400000
  );
}

function median(values) {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) {
  if (!values.length) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weightedAverage(values) {
  let weightedSum = 0;
  let totalWeight = 0;

  values.forEach((value, index) => {
    const weight = index + 1;

    weightedSum += value * weight;
    totalWeight += weight;
  });

  return weightedSum / totalWeight;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;

  const average = mean(values);
  const variance = values.reduce(
    (sum, value) => sum + (value - average) ** 2,
    0
  ) / (values.length - 1);

  return Math.sqrt(variance);
}

function getCycleLengths(cycles) {
  const sorted = [...cycles].sort(
    (a, b) => a.startDate.localeCompare(b.startDate)
  );

  const lengths = [];

  for (let index = 1; index < sorted.length; index++) {
    const length = differenceInDays(
      sorted[index - 1].startDate,
      sorted[index].startDate
    );

    if (length < 1) continue;

    lengths.push({
      length,
      startDate: sorted[index - 1].startDate,
      nextStartDate: sorted[index].startDate,
      usable: length >= MIN_CYCLE_LENGTH && length <= MAX_CYCLE_LENGTH
    });
  }

  return lengths;
}

function getPredictionMethod(count) {
  if (count < 4) return 'MEDIAN';

  return 'WEIGHTED_MEDIAN_BLEND';
}

function getPredictionQuality(lengths) {
  if (lengths.length < 2) {
    return {
      level: 'LIMITED',
      label: 'Data terbatas'
    };
  }

  const deviation = standardDeviation(lengths);

  if (lengths.length >= 6 && deviation <= 3) {
    return {
      level: 'MORE_STABLE',
      label: 'Riwayat relatif stabil'
    };
  }

  if (lengths.length >= 3 && deviation <= 6) {
    return {
      level: 'MODERATE',
      label: 'Riwayat cukup untuk estimasi'
    };
  }

  return {
    level: 'VARIABLE',
    label: 'Siklus bervariasi'
  };
}

export function predictNextPeriod(cycles) {
  const sorted = [...cycles]
    .map((cycle) => ({
      ...cycle,
      startDate: String(cycle.startDate).slice(0, 10)
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  if (sorted.length < 2) {
    return {
      available: false,
      reason: 'Tambahkan setidaknya dua tanggal mulai menstruasi yang berbeda.',
      requiredStartDates: 2,
      availableStartDates: sorted.length
    };
  }

  const calculated = getCycleLengths(sorted);
  const usable = calculated.filter((item) => item.usable);
  const excluded = calculated.filter((item) => !item.usable);

  if (!usable.length) {
    return {
      available: false,
      reason: 'Belum ada panjang siklus dalam rentang yang digunakan algoritma.',
      cycleLengths: calculated.map((item) => item.length),
      excludedCycles: excluded.map((item) => item.length)
    };
  }

  const lengths = usable.map((item) => item.length);
  const med = median(lengths);

  const rawPrediction = lengths.length < 4
    ? med
    : weightedAverage(lengths) * 0.6 + med * 0.4;

  const predictedCycleLength = Math.round(rawPrediction);
  const lastStartDate = sorted.at(-1).startDate;
  const predictedStart = addDays(lastStartDate, predictedCycleLength);

  const deviation = standardDeviation(lengths);
  const rangeDays = Math.max(2, Math.ceil(deviation));

  const rangeStart = addDays(predictedStart, -rangeDays);
  const rangeEnd = addDays(predictedStart, rangeDays);

  return {
    available: true,
    lastPeriodStart: lastStartDate,
    predictedStart,
    rangeStart,
    rangeEnd,
    predictedCycleLength,
    averageCycleLength: Number(mean(lengths).toFixed(2)),
    medianCycleLength: med,
    standardDeviation: Number(deviation.toFixed(2)),
    cycleLengths: calculated.map((item) => item.length),
    usableCycleCount: lengths.length,
    excludedCycles: excluded.map((item) => ({
      length: item.length,
      reason: `Di luar rentang algoritma ${MIN_CYCLE_LENGTH}-${MAX_CYCLE_LENGTH} hari.`
    })),
    method: getPredictionMethod(lengths.length),
    quality: getPredictionQuality(lengths),
    disclaimer: 'Prediksi berdasarkan riwayat, bukan tanggal pasti atau diagnosis medis.'
  };
}