import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { cpus, platform, release } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { build } from "vite";

const options = {
  rawPointCount: 18_000,
  sampledPointCount: 1_800,
  repetitions: 60,
  warmups: 3,
  cpuThrottle: 1,
  output: null,
};
const argumentsList = process.argv.slice(2);
for (let index = 0; index < argumentsList.length; index += 2) {
  const key = {
    "--raw-points": "rawPointCount",
    "--sampled-points": "sampledPointCount",
    "--repetitions": "repetitions",
    "--warmups": "warmups",
    "--cpu-throttle": "cpuThrottle",
    "--output": "output",
  }[argumentsList[index]];
  const value = argumentsList[index + 1];
  if (!key || value === undefined) {
    throw new Error("Usage: --raw-points N --sampled-points N --repetitions N --warmups N --cpu-throttle N --output FILE");
  }
  options[key] = key === "output" ? resolve(value) : Number(value);
}
if (!Number.isInteger(options.rawPointCount) || options.rawPointCount < 2 || options.rawPointCount > 100_000 ||
  !Number.isInteger(options.sampledPointCount) || options.sampledPointCount < 2 || options.sampledPointCount > options.rawPointCount ||
  !Number.isInteger(options.repetitions) || options.repetitions < 1 || options.repetitions > 100 ||
  !Number.isInteger(options.warmups) || options.warmups < 0 || options.warmups > 10 ||
  !Number.isFinite(options.cpuThrottle) || options.cpuThrottle < 1 || options.cpuThrottle > 6) {
  throw new Error("raw-points 2–100000; sampled-points 2–raw; repetitions 1–100; warmups 0–10; cpu-throttle 1–6.");
}
const { rawPointCount, sampledPointCount, repetitions, warmups } = options;
const samplerUrl = new URL("../apps/web/src/lib/downsample.ts", import.meta.url);

const baselineBundleSource = `
  import * as echarts from "echarts";
  globalThis.__benchmarkEcharts = echarts;
`;

const optimizedBundleSource = `
  import * as echarts from "echarts/core";
  import { LineChart } from "echarts/charts";
  import {
    AxisPointerComponent,
    DataZoomComponent,
    GridComponent,
    LegendComponent,
    MarkAreaComponent,
    MarkLineComponent,
    TitleComponent,
    TooltipComponent,
  } from "echarts/components";
  import { CanvasRenderer } from "echarts/renderers";

  echarts.use([
    LineChart,
    AxisPointerComponent,
    DataZoomComponent,
    GridComponent,
    LegendComponent,
    MarkAreaComponent,
    MarkLineComponent,
    TitleComponent,
    TooltipComponent,
    CanvasRenderer,
  ]);
  globalThis.__benchmarkEcharts = echarts;
`;

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function summarize(values) {
  return {
    medianMs: Number(percentile(values, 0.5).toFixed(3)),
    p95Ms: Number(percentile(values, 0.95).toFixed(3)),
    samplesMs: values.map((value) => Number(value.toFixed(3))),
  };
}

async function measureBundle(source) {
  const virtualId = "\0nexus-performance-entry";
  const result = await build({
    configFile: false,
    logLevel: "silent",
    root: new URL("../apps/web/", import.meta.url).pathname,
    plugins: [{
      name: "nexus-performance-entry",
      resolveId(id) {
        return id === "nexus-performance-entry" ? virtualId : undefined;
      },
      load(id) {
        return id === virtualId ? source : undefined;
      },
    }],
    build: {
      write: false,
      sourcemap: false,
      minify: "esbuild",
      rollupOptions: { input: "nexus-performance-entry" },
    },
  });

  const builds = Array.isArray(result) ? result : [result];
  const code = builds.flatMap((item) => item.output)
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");

  return {
    rawBytes: Buffer.byteLength(code),
    gzipBytes: gzipSync(code).byteLength,
  };
}

const benchmarkPage = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <style>
      html, body { margin: 0; background: #071015; }
      #chart { width: 1200px; height: 700px; }
    </style>
  </head>
  <body>
    <div id="chart"></div>
    <script type="module">
      import * as echarts from "/echarts.js";
      import { downsampleSynchronized } from "/downsample.js";

      const sensorKeys = ["webTensionLeft", "webTensionRight", "ovenTemperature", "lineSpeed", "defectRate"];

      function generatePoints(count) {
        const start = Date.UTC(2026, 7, 30, 0, 30, 0);
        return Array.from({ length: count }, (_, index) => {
          const event = Math.exp(-Math.pow((index - count * 0.78) / (count * 0.035), 2));
          return {
            timestamp: start + index * 100,
            webTensionLeft: 58 + Math.sin(index / 23) * 1.4 + event * 31,
            webTensionRight: 57 + Math.cos(index / 29) * 1.2 + event * 27,
            ovenTemperature: 160 + Math.sin(index / 41) * 0.3 + event * 12,
            lineSpeed: 83 + Math.cos(index / 53) * 0.4 - event * 15,
            defectRate: 0.12 + Math.abs(Math.sin(index / 17)) * 0.08 + event * 1.55,
          };
        });
      }

      function option(points, incidentAt) {
        const eventStart = incidentAt - 50000;
        const eventEnd = incidentAt + 82000;
        const grids = [0, 1, 2, 3].map((_, index) => ({
          left: 64,
          right: 24,
          top: 20 + index * 168,
          height: 130,
        }));
        const xAxis = grids.map((_, index) => ({
          type: "time",
          gridIndex: index,
          axisLabel: { show: index === 3 },
          splitLine: { show: false },
        }));
        const yAxis = grids.map((_, index) => ({ type: "value", gridIndex: index, splitLine: { show: false } }));
        const markArea = {
          silent: true,
          data: [[{ xAxis: eventStart }, { xAxis: eventEnd }]],
        };
        const seriesConfig = [
          { signalIndex: 0, axisIndex: 0, name: "좌측 장력", markArea: true, markLine: true },
          { signalIndex: 1, axisIndex: 0, name: "우측 장력" },
          { constantValue: 160, axisIndex: 1, name: "설정 온도", silent: true },
          { signalIndex: 2, axisIndex: 1, name: "측정 온도", markArea: true },
          { signalIndex: 3, axisIndex: 2, name: "라인 속도", markArea: true },
          { signalIndex: 4, axisIndex: 3, name: "비전 검사 결함률", markArea: true },
        ];

        return {
          animation: false,
          grid: grids,
          xAxis,
          yAxis,
          tooltip: { trigger: "axis" },
          axisPointer: { link: [{ xAxisIndex: "all" }] },
          legend: [
            { data: ["좌측 장력", "우측 장력"] },
            { data: ["설정 온도", "측정 온도"], top: "28%" },
          ],
          dataZoom: [{ type: "inside", xAxisIndex: [0, 1, 2, 3], filterMode: "none" }],
          series: seriesConfig.map((config) => ({
            name: config.name,
            type: "line",
            showSymbol: false,
            sampling: "none",
            silent: config.silent,
            xAxisIndex: config.axisIndex,
            yAxisIndex: config.axisIndex,
            data: points.map((point) => [
              point.timestamp,
              config.constantValue ?? point[sensorKeys[config.signalIndex]],
            ]),
            markArea: config.markArea ? markArea : undefined,
            markLine: config.markLine ? {
              silent: true,
              symbol: "none",
              label: { show: false },
              data: [
                { xAxis: eventStart },
                { xAxis: incidentAt },
                { xAxis: eventEnd },
              ],
            } : undefined,
          })),
        };
      }

      async function render(chart, chartOption) {
        chart.clear();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const startedAt = performance.now();
        chart.setOption(chartOption, { notMerge: true, lazyUpdate: false });
        chart.getZr().flush();
        const duration = performance.now() - startedAt;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        return duration;
      }

      globalThis.runNexusBenchmark = async ({ rawCount, sampledCount, repetitions, warmups }) => {
        const raw = generatePoints(rawCount);
        const incidentAt = raw[Math.floor(raw.length * 0.78)].timestamp;
        const sampled = downsampleSynchronized(raw, sampledCount);
        const chart = echarts.init(document.querySelector("#chart"), undefined, {
          renderer: "canvas",
          devicePixelRatio: 1,
        });

        for (let index = 0; index < warmups; index += 1) {
          await render(chart, option(raw, incidentAt));
          await render(chart, option(downsampleSynchronized(raw, sampledCount), incidentAt));
        }

        const rawDurations = [];
        const sampledDurations = [];
        const rawPreparation = [];
        const sampledPreparation = [];
        const samplingDurations = [];
        for (let index = 0; index < repetitions; index += 1) {
          const rawStartedAt = performance.now();
          const rawOption = option(raw, incidentAt);
          rawPreparation.push(performance.now() - rawStartedAt);
          const sampledStartedAt = performance.now();
          const currentSampled = downsampleSynchronized(raw, sampledCount);
          samplingDurations.push(performance.now() - sampledStartedAt);
          const sampledOption = option(currentSampled, incidentAt);
          sampledPreparation.push(performance.now() - sampledStartedAt);
          // Alternate draw order so one scenario does not always run first.
          if (index % 2 === 0) {
            rawDurations.push(await render(chart, rawOption));
            sampledDurations.push(await render(chart, sampledOption));
          } else {
            sampledDurations.push(await render(chart, sampledOption));
            rawDurations.push(await render(chart, rawOption));
          }
        }

        chart.dispose();
        return { rawDurations, sampledDurations, rawPreparation, sampledPreparation, samplingDurations, selectedPointCount: sampled.length };
      };
    </script>
  </body>
</html>`;

async function measureChartRendering() {
  const echartsBundle = await readFile(new URL("../node_modules/echarts/dist/echarts.esm.min.js", import.meta.url));
  // Build the actual application sampler; do not keep a second, drifting implementation.
  const samplerBuild = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: "esbuild",
      lib: { entry: fileURLToPath(samplerUrl), formats: ["es"] },
    },
  });
  const samplerCode = (Array.isArray(samplerBuild) ? samplerBuild : [samplerBuild])
    .flatMap((item) => item.output).filter((item) => item.type === "chunk")
    .map((item) => item.code).join("\n");
  const server = createServer((request, response) => {
    if (request.url === "/echarts.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(echartsBundle);
      return;
    }
    if (request.url === "/downsample.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(samplerCode);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(benchmarkPage);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const browser = await chromium.launch({ args: ["--enable-precise-memory-info"] });

  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: options.cpuThrottle });
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForFunction(() => typeof globalThis.runNexusBenchmark === "function");
    const browserVersion = browser.version();
    const result = await page.evaluate(
      (config) => globalThis.runNexusBenchmark(config),
      { rawCount: rawPointCount, sampledCount: sampledPointCount, repetitions, warmups },
    );
    return {
      browserVersion,
      raw: summarize(result.rawDurations),
      sampled: summarize(result.sampledDurations),
      sampling: summarize(result.samplingDurations),
      rawPreparation: summarize(result.rawPreparation),
      sampledPreparation: summarize(result.sampledPreparation),
      rawPreparationAndDraw: summarize(result.rawDurations.map((duration, index) => duration + result.rawPreparation[index])),
      sampledPreparationAndDraw: summarize(result.sampledDurations.map((duration, index) => duration + result.sampledPreparation[index])),
      selectedPointCount: result.selectedPointCount,
    };
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const [baselineBundle, optimizedBundle] = await Promise.all([
  measureBundle(baselineBundleSource),
  measureBundle(optimizedBundleSource),
]);
// Finish compilation before measuring so bundling does not compete with the chart.
const chartRendering = await measureChartRendering();

const bundleReduction = 1 - optimizedBundle.gzipBytes / baselineBundle.gzipBytes;
const renderReduction = 1 - chartRendering.sampled.medianMs / chartRendering.raw.medianMs;

const result = {
  measuredAt: new Date().toISOString(),
    environment: {
    os: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model ?? "unknown",
    node: process.version,
    chromium: chartRendering.browserVersion,
    viewport: "1200x700, DPR 1",
      repetitions,
      warmupsPerScenario: warmups,
      cpuThrottleRate: options.cpuThrottle,
      cpuThrottleMethod: options.cpuThrottle === 1 ? "none" : "Chromium DevTools Protocol Emulation.setCPUThrottlingRate",
  },
  echartsImportBundle: {
    baseline: baselineBundle,
    optimized: optimizedBundle,
    gzipReductionPercent: Number((bundleReduction * 100).toFixed(1)),
  },
  synchronizedChartRender: {
    scope: {
      panels: 4,
      series: 6,
      sensorSeries: 5,
      includes: ["set-temperature-reference", "linked-axis-pointer", "data-zoom", "mark-area", "mark-line"],
      sampler: "shared-bucket-edges-and-per-sensor-extrema",
      samplerSourceSha256: createHash("sha256").update(await readFile(samplerUrl)).digest("hex"),
      perSeriesSampling: "none",
      excludes: ["network", "React", "stream-batching", "browser-compositor", "long-running-load", "physical low-end device"],
    },
    baseline: { points: rawPointCount, ...chartRendering.raw },
    optimized: { pointBudget: sampledPointCount, points: chartRendering.selectedPointCount, ...chartRendering.sampled },
    medianReductionPercent: Number((renderReduction * 100).toFixed(1)),
  },
  chartPreparation: {
    samplingOnly: chartRendering.sampling,
    baselineOption: chartRendering.rawPreparation,
    optimizedSamplingAndOption: chartRendering.sampledPreparation,
  },
  chartPreparationAndDraw: {
    baseline: chartRendering.rawPreparationAndDraw,
    optimized: chartRendering.sampledPreparationAndDraw,
    scope: "Synchronous data preparation plus setOption/flush, not full application or paint latency",
  },
};

const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (options.output) {
  await writeFile(options.output, serialized, { flag: "wx" });
  console.log(JSON.stringify({ output: options.output, synchronizedChartRender: result.synchronizedChartRender }, null, 2));
} else {
  console.log(serialized);
}
