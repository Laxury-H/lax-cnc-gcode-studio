import { a as require_react, o as __toESM, t as require_jsx_runtime } from "../index.js";
//#region app/page.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
var DEFAULT_STOCK = {
	width: 2440,
	height: 1220,
	thickness: 18,
	originX: 0,
	originY: 0,
	safeZ: 22,
	toolDiameter: 6,
	clearance: 12,
	rapidFeed: 8e3
};
var EPSILON = .001;
var DEFAULT_ORBIT = {
	yaw: Math.PI / 4,
	pitch: Math.PI / 5.2
};
var VIEW_META = {
	xoy: {
		short: "XOY",
		title: "Mặt phẳng XOY",
		description: "Nhìn từ trên"
	},
	xoz: {
		short: "XOZ",
		title: "Mặt phẳng XOZ",
		description: "Nhìn chính diện · Z phóng đại"
	},
	yoz: {
		short: "YOZ",
		title: "Mặt phẳng YOZ",
		description: "Nhìn cạnh · Z phóng đại"
	},
	iso: {
		short: "3D",
		title: "3D Backplot",
		description: "Kéo để xoay · Shift+kéo để pan"
	}
};
function buildSampleProgram() {
	const panels = [
		[
			20,
			20,
			720,
			380
		],
		[
			20,
			420,
			720,
			360
		],
		[
			760,
			20,
			680,
			380
		],
		[
			760,
			420,
			680,
			360
		],
		[
			1460,
			20,
			600,
			220
		],
		[
			1460,
			260,
			285,
			200
		],
		[
			1755,
			260,
			305,
			200
		],
		[
			2080,
			20,
			340,
			1120
		],
		[
			1460,
			480,
			285,
			260
		],
		[
			1755,
			480,
			305,
			260
		],
		[
			1460,
			760,
			285,
			380
		],
		[
			1755,
			760,
			305,
			380
		]
	];
	const lines = [
		"%",
		"(LAX CNC STUDIO - TU BEP CAN A-01)",
		"(PHOI 2440 X 1220 X 18)",
		"G90 G21 G17",
		"G54",
		"M33 S18000",
		"G600 T25",
		"M73",
		"G0 Z22.000"
	];
	panels.forEach(([x, y, width, height], index) => {
		const x2 = x + width;
		const y2 = y + height;
		lines.push(`(P${String(index + 1).padStart(2, "0")} - ${width} X ${height})`, `G0 X${x.toFixed(3)} Y${y.toFixed(3)}`, "G1 Z7.000 F1000.0", `G1 X${x2.toFixed(3)} Y${y.toFixed(3)} F3200.0`, `G1 X${x2.toFixed(3)} Y${y2.toFixed(3)}`, `G1 X${x.toFixed(3)} Y${y2.toFixed(3)}`, `G1 X${x.toFixed(3)} Y${y.toFixed(3)}`, "G0 Z22.000");
	});
	lines.push("(KHOAN BAN LE)", "G81 X60.000 Y70.000 Z7.000 R22.000 F1000.0", "X700.000 Y70.000", "X60.000 Y350.000", "X700.000 Y350.000", "G80", "M83", "M5", "M30", "%");
	return lines.join("\n");
}
var SAMPLE_GCODE = buildSampleProgram();
function stripComments(line) {
	return line.replace(/\([^)]*\)/g, " ").replace(/;.*$/, " ").trim();
}
function tokenize(line) {
	const tokens = [];
	for (const match of line.matchAll(/([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/gi)) {
		const value = Number(match[2]);
		if (Number.isFinite(value)) tokens.push({
			letter: match[1].toUpperCase(),
			value
		});
	}
	return tokens;
}
function distance3(a, b) {
	return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}
function distance2(a, b) {
	return Math.hypot(b.x - a.x, b.y - a.y);
}
function cloneVec(point) {
	return {
		x: point.x,
		y: point.y,
		z: point.z
	};
}
function arcFromRadius(start, end, radiusWord, clockwise) {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const chord = Math.hypot(dx, dy);
	const radius = Math.abs(radiusWord);
	if (chord < EPSILON || radius < chord / 2 - EPSILON) return null;
	const midX = (start.x + end.x) / 2;
	const midY = (start.y + end.y) / 2;
	const h = Math.sqrt(Math.max(0, radius * radius - chord * chord / 4));
	const nx = -dy / chord;
	const ny = dx / chord;
	const candidates = [{
		x: midX + nx * h,
		y: midY + ny * h
	}, {
		x: midX - nx * h,
		y: midY - ny * h
	}];
	const desiredLongArc = radiusWord < 0;
	const scored = candidates.map((center) => {
		const a0 = Math.atan2(start.y - center.y, start.x - center.x);
		let sweep = Math.atan2(end.y - center.y, end.x - center.x) - a0;
		if (clockwise && sweep >= 0) sweep -= Math.PI * 2;
		if (!clockwise && sweep <= 0) sweep += Math.PI * 2;
		return {
			center,
			sweep,
			isLong: Math.abs(sweep) > Math.PI + EPSILON
		};
	});
	return scored.find((candidate) => candidate.isLong === desiredLongArc) ?? scored[0];
}
function sampleArc(start, end, clockwise, i, j, radius, arcCenterAbsolute) {
	let center = null;
	let forcedSweep = null;
	if (i !== void 0 || j !== void 0) center = {
		x: arcCenterAbsolute ? i ?? start.x : start.x + (i ?? 0),
		y: arcCenterAbsolute ? j ?? start.y : start.y + (j ?? 0)
	};
	else if (radius !== void 0) {
		const resolved = arcFromRadius(start, end, radius, clockwise);
		if (resolved) {
			center = resolved.center;
			forcedSweep = resolved.sweep;
		}
	}
	if (!center) return null;
	const effectiveRadius = Math.hypot(start.x - center.x, start.y - center.y);
	if (effectiveRadius < EPSILON) return null;
	const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
	const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
	let sweep = forcedSweep ?? endAngle - startAngle;
	if (forcedSweep === null) {
		if (clockwise && sweep >= 0) sweep -= Math.PI * 2;
		if (!clockwise && sweep <= 0) sweep += Math.PI * 2;
	}
	const divisions = Math.max(24, Math.min(180, Math.ceil(Math.abs(sweep) * effectiveRadius / 8)));
	const points = [];
	for (let index = 0; index <= divisions; index += 1) {
		const ratio = index / divisions;
		const angle = startAngle + sweep * ratio;
		points.push({
			x: center.x + Math.cos(angle) * effectiveRadius,
			y: center.y + Math.sin(angle) * effectiveRadius,
			z: start.z + (end.z - start.z) * ratio
		});
	}
	points[0] = cloneVec(start);
	points[points.length - 1] = cloneVec(end);
	return points;
}
function polylineLength(points) {
	let total = 0;
	for (let index = 1; index < points.length; index += 1) total += distance3(points[index - 1], points[index]);
	return total;
}
function valueOf(tokens, letter) {
	return [...tokens].reverse().find((item) => item.letter === letter)?.value;
}
function addDiagnostic(diagnostics, lineIndex, severity, code, message) {
	const key = `${lineIndex}-${severity}-${code}-${message}`;
	if (!diagnostics.some((item) => item.id === key)) diagnostics.push({
		id: key,
		lineIndex,
		severity,
		code,
		message
	});
}
function boundsForPoints(points) {
	return points.reduce((bounds, point) => ({
		minX: Math.min(bounds.minX, point.x),
		minY: Math.min(bounds.minY, point.y),
		minZ: Math.min(bounds.minZ, point.z),
		maxX: Math.max(bounds.maxX, point.x),
		maxY: Math.max(bounds.maxY, point.y),
		maxZ: Math.max(bounds.maxZ, point.z)
	}), {
		minX: Number.POSITIVE_INFINITY,
		minY: Number.POSITIVE_INFINITY,
		minZ: Number.POSITIVE_INFINITY,
		maxX: Number.NEGATIVE_INFINITY,
		maxY: Number.NEGATIVE_INFINITY,
		maxZ: Number.NEGATIVE_INFINITY
	});
}
function rectangleGap(a, b) {
	const dx = Math.max(b.minX - a.maxX, a.minX - b.maxX, 0);
	const dy = Math.max(b.minY - a.maxY, a.minY - b.maxY, 0);
	return Math.hypot(dx, dy);
}
function containsPart(outer, inner) {
	const tolerance = .5;
	return inner.minX >= outer.minX - tolerance && inner.maxX <= outer.maxX + tolerance && inner.minY >= outer.minY - tolerance && inner.maxY <= outer.maxY + tolerance;
}
function detectParts(segments, stock) {
	const closeTolerance = Math.max(.05, Math.min(.3, stock.toolDiameter * .05));
	const contours = [];
	let active = [];
	let sourceLine = 0;
	let activeHasArc = false;
	const captureClosedTail = () => {
		if (active.length < 4) return;
		const end = active[active.length - 1];
		let closedFrom = -1;
		for (let index = 0; index <= active.length - 4; index += 1) if (distance2(active[index], end) <= closeTolerance) {
			closedFrom = index;
			break;
		}
		if (closedFrom >= 0) {
			contours.push({
				points: active.slice(closedFrom).map(cloneVec),
				sourceLine,
				hasArc: activeHasArc
			});
			active = [];
			activeHasArc = false;
		}
	};
	for (const segment of segments) {
		if (!(segment.kind !== "rapid" && segment.kind !== "drill" && distance2(segment.start, segment.end) > EPSILON)) continue;
		const segmentPoints = segment.points.length > 2 ? segment.points : [segment.start, segment.end];
		if (!active.length) {
			active = segmentPoints.map(cloneVec);
			sourceLine = segment.lineIndex;
			activeHasArc = segment.kind === "arc-cw" || segment.kind === "arc-ccw";
		} else if (distance2(active[active.length - 1], segmentPoints[0]) <= closeTolerance) {
			active.push(...segmentPoints.slice(1).map(cloneVec));
			activeHasArc = activeHasArc || segment.kind === "arc-cw" || segment.kind === "arc-ccw";
		} else {
			active = segmentPoints.map(cloneVec);
			sourceLine = segment.lineIndex;
			activeHasArc = segment.kind === "arc-cw" || segment.kind === "arc-ccw";
		}
		captureClosedTail();
	}
	const rawParts = contours.map((contour, index) => {
		const bounds = boundsForPoints(contour.points);
		const toolpathWidth = bounds.maxX - bounds.minX;
		const toolpathHeight = bounds.maxY - bounds.minY;
		const compensated = contour.hasArc && toolpathWidth >= stock.toolDiameter * 4 && toolpathHeight >= stock.toolDiameter * 4;
		const inset = compensated ? stock.toolDiameter / 2 : 0;
		const minX = bounds.minX + inset;
		const minY = bounds.minY + inset;
		const maxX = bounds.maxX - inset;
		const maxY = bounds.maxY - inset;
		const width = Math.max(0, maxX - minX);
		const height = Math.max(0, maxY - minY);
		return {
			id: `P${String(index + 1).padStart(2, "0")}`,
			points: contour.points,
			sourceLine: contour.sourceLine,
			minX,
			minY,
			maxX,
			maxY,
			width,
			height,
			toolpathWidth,
			toolpathHeight,
			compensated,
			area: width * height,
			nearestGap: null,
			edgeGap: Math.min(minX - stock.originX, minY - stock.originY, stock.originX + stock.width - maxX, stock.originY + stock.height - maxY)
		};
	}).filter((part) => part.width >= 40 && part.height >= 40);
	const outerParts = rawParts.filter((part) => !rawParts.some((candidate) => candidate !== part && candidate.area > part.area * 1.15 && containsPart(candidate, part)));
	outerParts.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
	outerParts.forEach((part, index) => {
		part.id = `P${String(index + 1).padStart(2, "0")}`;
		let nearest = Number.POSITIVE_INFINITY;
		outerParts.forEach((candidate) => {
			if (candidate !== part) nearest = Math.min(nearest, rectangleGap(part, candidate));
		});
		part.nearestGap = Number.isFinite(nearest) ? nearest : null;
	});
	return outerParts;
}
function parseProgram(source, stock, profile) {
	const lines = source.replace(/\r\n?/g, "\n").split("\n");
	const segments = [];
	const diagnostics = [];
	const knownStandardG = new Set([
		0,
		1,
		2,
		3,
		4,
		17,
		18,
		19,
		20,
		21,
		28,
		40,
		41,
		42,
		43,
		49,
		53,
		54,
		55,
		56,
		57,
		58,
		59,
		61,
		64,
		73,
		80,
		81,
		82,
		83,
		84,
		85,
		86,
		87,
		88,
		89,
		90,
		91,
		90.1,
		91.1,
		94,
		98,
		99
	]);
	const knownStandardM = new Set([
		0,
		1,
		2,
		3,
		4,
		5,
		6,
		7,
		8,
		9,
		30
	]);
	const customM = new Set([
		33,
		73,
		83
	]);
	let position = {
		x: stock.originX,
		y: stock.originY,
		z: stock.safeZ
	};
	let absolute = true;
	let unitsFactor = 1;
	let units = "mm";
	let plane = 17;
	let motion = 0;
	let feed = 0;
	let spindle = 0;
	let tool = "—";
	let spindleOn = false;
	let arcCenterAbsolute = false;
	let sawUnitMode = false;
	let sawDistanceMode = false;
	let reportedSpindleWarning = false;
	let knownX = false;
	let knownY = false;
	let canned = null;
	const pushSegment = (lineIndex, raw, start, end, kind, points) => {
		const path = points ?? [cloneVec(start), cloneVec(end)];
		const length = polylineLength(path);
		segments.push({
			id: segments.length,
			lineIndex,
			lineNumber: lineIndex + 1,
			raw,
			start: cloneVec(start),
			end: cloneVec(end),
			points: path,
			kind,
			feed,
			spindle,
			tool,
			length
		});
	};
	lines.forEach((raw, lineIndex) => {
		const block = stripComments(raw).toUpperCase();
		if (!block || block === "%") return;
		const tokens = tokenize(block);
		const gCodes = tokens.filter((token) => token.letter === "G").map((token) => token.value);
		const mCodes = tokens.filter((token) => token.letter === "M").map((token) => token.value);
		if (gCodes.filter((code) => [
			0,
			1,
			2,
			3,
			73,
			80,
			81,
			82,
			83,
			84,
			85,
			86,
			87,
			88,
			89
		].includes(code)).length > 1) addDiagnostic(diagnostics, lineIndex, "error", "MODAL_CONFLICT", "Có nhiều lệnh cùng nhóm chuyển động trong một dòng.");
		gCodes.forEach((code) => {
			const customKnown = profile === "router-custom" && code === 600;
			if (!knownStandardG.has(code) && !customKnown) addDiagnostic(diagnostics, lineIndex, "warning", "UNSUPPORTED_G", `G${code} chưa có quy tắc hình học trong hồ sơ máy hiện tại.`);
		});
		mCodes.forEach((code) => {
			const customKnown = profile === "router-custom" && customM.has(code);
			if (!knownStandardM.has(code) && !customKnown) addDiagnostic(diagnostics, lineIndex, "warning", "UNSUPPORTED_M", `M${code} được giữ nguyên nhưng chưa được ánh xạ trạng thái máy.`);
		});
		if (gCodes.includes(20)) {
			unitsFactor = 25.4;
			units = "inch";
			sawUnitMode = true;
		}
		if (gCodes.includes(21)) {
			unitsFactor = 1;
			units = "mm";
			sawUnitMode = true;
		}
		if (gCodes.includes(90)) {
			absolute = true;
			sawDistanceMode = true;
		}
		if (gCodes.includes(91)) {
			absolute = false;
			sawDistanceMode = true;
		}
		if (gCodes.includes(90.1)) arcCenterAbsolute = true;
		if (gCodes.includes(91.1)) arcCenterAbsolute = false;
		if (gCodes.includes(17)) plane = 17;
		if (gCodes.includes(18)) plane = 18;
		if (gCodes.includes(19)) plane = 19;
		const feedWord = valueOf(tokens, "F");
		const spindleWord = valueOf(tokens, "S");
		const toolWord = valueOf(tokens, "T");
		if (feedWord !== void 0) feed = feedWord * unitsFactor;
		if (spindleWord !== void 0) spindle = spindleWord;
		if (toolWord !== void 0) tool = `T${Math.trunc(toolWord)}`;
		if (mCodes.some((code) => code === 3 || code === 4)) spindleOn = true;
		if (profile === "router-custom" && mCodes.includes(33)) spindleOn = true;
		if (mCodes.includes(5)) spindleOn = false;
		if (gCodes.includes(80)) canned = null;
		const cannedCode = gCodes.find((code) => [
			73,
			81,
			82,
			83,
			84,
			85,
			86,
			87,
			88,
			89
		].includes(code));
		if (cannedCode !== void 0) {
			const zWord = valueOf(tokens, "Z");
			const rWord = valueOf(tokens, "R");
			const qWord = valueOf(tokens, "Q");
			const resolveAxis = (word, current) => word === void 0 ? current : absolute ? word * unitsFactor : current + word * unitsFactor;
			canned = {
				code: cannedCode,
				z: resolveAxis(zWord, position.z),
				r: resolveAxis(rWord, position.z),
				q: qWord === void 0 ? null : qWord * unitsFactor,
				feed
			};
			motion = cannedCode;
		} else {
			const explicitMotion = gCodes.find((code) => [
				0,
				1,
				2,
				3
			].includes(code));
			if (explicitMotion !== void 0) motion = explicitMotion;
		}
		const xWord = valueOf(tokens, "X");
		const yWord = valueOf(tokens, "Y");
		const zWord = valueOf(tokens, "Z");
		const iWord = valueOf(tokens, "I");
		const jWord = valueOf(tokens, "J");
		const rWord = valueOf(tokens, "R");
		const hasAxis = xWord !== void 0 || yWord !== void 0 || zWord !== void 0;
		const hasFullCircleDefinition = (motion === 2 || motion === 3) && (iWord !== void 0 || jWord !== void 0 || rWord !== void 0);
		const resolveAxis = (word, current) => word === void 0 ? current : absolute ? word * unitsFactor : current + word * unitsFactor;
		if (canned !== null && !gCodes.includes(80) && (cannedCode !== void 0 || xWord !== void 0 || yWord !== void 0) && canned) {
			const holeX = resolveAxis(xWord, position.x);
			const holeY = resolveAxis(yWord, position.y);
			const rapidEnd = {
				x: holeX,
				y: holeY,
				z: canned.r
			};
			const startsFromUnknownRapid = xWord !== void 0 && !knownX || yWord !== void 0 && !knownY;
			if (xWord !== void 0) knownX = true;
			if (yWord !== void 0) knownY = true;
			if (!startsFromUnknownRapid && distance3(position, rapidEnd) > EPSILON) pushSegment(lineIndex, raw, position, rapidEnd, "rapid");
			const drillEnd = {
				x: holeX,
				y: holeY,
				z: canned.z
			};
			const previousFeed = feed;
			feed = canned.feed || feed;
			pushSegment(lineIndex, raw, rapidEnd, drillEnd, "drill");
			feed = previousFeed;
			position = rapidEnd;
			return;
		}
		if (!hasAxis && !hasFullCircleDefinition || ![
			0,
			1,
			2,
			3
		].includes(motion)) return;
		const target = {
			x: resolveAxis(xWord, position.x),
			y: resolveAxis(yWord, position.y),
			z: resolveAxis(zWord, position.z)
		};
		const startsFromUnknownRapid = motion === 0 && (xWord !== void 0 && !knownX || yWord !== void 0 && !knownY);
		if (xWord !== void 0) knownX = true;
		if (yWord !== void 0) knownY = true;
		if (startsFromUnknownRapid) {
			position = target;
			return;
		}
		const xyChanged = distance2(position, target) > EPSILON;
		const stockTolerance = Math.max(.1, stock.toolDiameter / 2);
		if (xyChanged && (target.x < stock.originX - stockTolerance - EPSILON || target.x > stock.originX + stock.width + stockTolerance + EPSILON || target.y < stock.originY - stockTolerance - EPSILON || target.y > stock.originY + stock.height + stockTolerance + EPSILON)) addDiagnostic(diagnostics, lineIndex, "warning", "OUTSIDE_STOCK", "Tọa độ X/Y nằm ngoài vùng phôi đang khai báo.");
		if (motion === 0 && xyChanged && target.z < stock.safeZ - EPSILON) addDiagnostic(diagnostics, lineIndex, "warning", "LOW_RAPID", `G0 chạy ngang tại Z${target.z.toFixed(3)}, thấp hơn Z an toàn ${stock.safeZ.toFixed(3)}.`);
		if ([
			1,
			2,
			3
		].includes(motion) && !spindleOn && !reportedSpindleWarning) {
			addDiagnostic(diagnostics, lineIndex, "warning", "SPINDLE_OFF", "Có chuyển động cắt khi trạng thái spindle chưa bật.");
			reportedSpindleWarning = true;
		}
		if ([
			1,
			2,
			3
		].includes(motion) && feed <= 0) addDiagnostic(diagnostics, lineIndex, "error", "MISSING_FEED", "Chuyển động cắt chưa có tốc độ F hợp lệ.");
		if (motion === 2 || motion === 3) {
			if (plane !== 17) addDiagnostic(diagnostics, lineIndex, "warning", "ARC_PLANE", `Bản hiện tại chỉ nội suy cung G2/G3 đầy đủ trên mặt phẳng G17; đang gặp G${plane}.`);
			const points = sampleArc(position, target, motion === 2, iWord === void 0 ? void 0 : iWord * unitsFactor, jWord === void 0 ? void 0 : jWord * unitsFactor, rWord === void 0 ? void 0 : rWord * unitsFactor, arcCenterAbsolute);
			if (!points) {
				addDiagnostic(diagnostics, lineIndex, "error", "INVALID_ARC", "Không xác định được tâm cung. Kiểm tra I/J hoặc R.");
				pushSegment(lineIndex, raw, position, target, motion === 2 ? "arc-cw" : "arc-ccw");
			} else pushSegment(lineIndex, raw, position, target, motion === 2 ? "arc-cw" : "arc-ccw", points);
		} else pushSegment(lineIndex, raw, position, target, motion === 0 ? "rapid" : "cut");
		position = target;
	});
	if (!sawUnitMode) addDiagnostic(diagnostics, 0, "warning", "UNITS_NOT_SET", "Chương trình chưa khai báo G20/G21; đang tạm hiểu là milimét.");
	if (!sawDistanceMode) addDiagnostic(diagnostics, 0, "warning", "DISTANCE_NOT_SET", "Chương trình chưa khai báo G90/G91; đang tạm hiểu là tuyệt đối.");
	const parts = detectParts(segments, stock);
	const reportedPairs = /* @__PURE__ */ new Set();
	for (let left = 0; left < parts.length; left += 1) for (let right = left + 1; right < parts.length; right += 1) {
		const gap = rectangleGap(parts[left], parts[right]);
		if (gap < stock.clearance - EPSILON) {
			const pair = `${parts[left].id}-${parts[right].id}`;
			if (!reportedPairs.has(pair)) {
				addDiagnostic(diagnostics, parts[right].sourceLine, gap <= EPSILON ? "error" : "warning", gap <= EPSILON ? "PART_OVERLAP" : "PART_GAP", gap <= EPSILON ? `${parts[left].id} và ${parts[right].id} đang chồng biên dạng.` : `Khoảng cách ${parts[left].id}–${parts[right].id} chỉ ${gap.toFixed(1)} mm, nhỏ hơn mức ${stock.clearance.toFixed(1)} mm.`);
				reportedPairs.add(pair);
			}
		}
	}
	parts.forEach((part) => {
		if (part.edgeGap < stock.clearance - EPSILON) addDiagnostic(diagnostics, part.sourceLine, part.edgeGap < 0 ? "error" : "warning", "EDGE_GAP", `${part.id} cách mép phôi ${part.edgeGap.toFixed(1)} mm, nhỏ hơn mức ${stock.clearance.toFixed(1)} mm.`);
	});
	const allPoints = segments.flatMap((segment) => segment.points);
	const bounds = allPoints.length ? boundsForPoints(allPoints) : {
		minX: stock.originX,
		minY: stock.originY,
		minZ: 0,
		maxX: stock.originX,
		maxY: stock.originY,
		maxZ: stock.safeZ
	};
	let cutLength = 0;
	let rapidLength = 0;
	let estimatedSeconds = 0;
	let drillHoles = 0;
	segments.forEach((segment) => {
		if (segment.kind === "rapid") {
			rapidLength += segment.length;
			estimatedSeconds += segment.length / Math.max(1, stock.rapidFeed) * 60;
		} else {
			cutLength += segment.length;
			estimatedSeconds += segment.length / Math.max(1, segment.feed || 1) * 60;
			if (segment.kind === "drill") drillHoles += 1;
		}
	});
	diagnostics.sort((a, b) => ({
		error: 0,
		warning: 1,
		info: 2
	})[a.severity] - {
		error: 0,
		warning: 1,
		info: 2
	}[b.severity] || a.lineIndex - b.lineIndex);
	return {
		lines,
		segments,
		diagnostics,
		parts,
		cutLength,
		rapidLength,
		estimatedSeconds,
		drillHoles,
		bounds,
		finalState: {
			position,
			feed,
			spindle,
			tool,
			units,
			absolute,
			spindleOn
		}
	};
}
function orientStockForProgram(source, current, profile) {
	if (Math.abs(current.width - current.height) <= EPSILON) return {
		stock: current,
		rotated: false
	};
	const preview = parseProgram(source, current, profile);
	const tolerance = Math.max(10, current.toolDiameter);
	const fits = (width, height) => preview.bounds.minX >= current.originX - tolerance && preview.bounds.maxX <= current.originX + width + tolerance && preview.bounds.minY >= current.originY - tolerance && preview.bounds.maxY <= current.originY + height + tolerance;
	const currentFits = fits(current.width, current.height);
	const rotatedFits = fits(current.height, current.width);
	if (!currentFits && rotatedFits) return {
		stock: {
			...current,
			width: current.height,
			height: current.width
		},
		rotated: true
	};
	return {
		stock: current,
		rotated: false
	};
}
function pointOnSegment(segment, progress) {
	const clamped = Math.max(0, Math.min(1, progress));
	if (segment.points.length <= 2) return {
		x: segment.start.x + (segment.end.x - segment.start.x) * clamped,
		y: segment.start.y + (segment.end.y - segment.start.y) * clamped,
		z: segment.start.z + (segment.end.z - segment.start.z) * clamped
	};
	let target = (segment.length || 1) * clamped;
	for (let index = 1; index < segment.points.length; index += 1) {
		const from = segment.points[index - 1];
		const to = segment.points[index];
		const length = distance3(from, to);
		if (target <= length || index === segment.points.length - 1) {
			const ratio = length <= EPSILON ? 0 : target / length;
			return {
				x: from.x + (to.x - from.x) * ratio,
				y: from.y + (to.y - from.y) * ratio,
				z: from.z + (to.z - from.z) * ratio
			};
		}
		target -= length;
	}
	return cloneVec(segment.end);
}
function partialPoints(segment, progress) {
	const clamped = Math.max(0, Math.min(1, progress));
	if (clamped >= 1) return segment.points;
	if (clamped <= 0) return [segment.start];
	let remaining = (segment.length || 1) * clamped;
	const result = [segment.points[0]];
	for (let index = 1; index < segment.points.length; index += 1) {
		const from = segment.points[index - 1];
		const to = segment.points[index];
		const length = distance3(from, to);
		if (remaining >= length) {
			result.push(to);
			remaining -= length;
		} else {
			const ratio = length <= EPSILON ? 0 : remaining / length;
			result.push({
				x: from.x + (to.x - from.x) * ratio,
				y: from.y + (to.y - from.y) * ratio,
				z: from.z + (to.z - from.z) * ratio
			});
			break;
		}
	}
	return result;
}
function formatTime(totalSeconds) {
	const rounded = Math.max(0, Math.round(totalSeconds));
	const hours = Math.floor(rounded / 3600);
	const minutes = Math.floor(rounded % 3600 / 60);
	const seconds = rounded % 60;
	if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
function formatLength(mm) {
	return mm >= 1e3 ? `${(mm / 1e3).toFixed(2)} m` : `${mm.toFixed(1)} mm`;
}
function motionLabel(segment) {
	if (!segment) return "CHƯA CÓ CHUYỂN ĐỘNG";
	if (segment.kind === "rapid") return "G0 · CHẠY NHANH";
	if (segment.kind === "cut") return "G1 · CẮT TUYẾN TÍNH";
	if (segment.kind === "arc-cw") return "G2 · CUNG TRÒN CW";
	if (segment.kind === "arc-ccw") return "G3 · CUNG TRÒN CCW";
	return "CHU TRÌNH KHOAN";
}
function Icon({ name, size = 20 }) {
	const common = {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.8,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": true
	};
	const paths = {
		play: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: "m8 5 11 7-11 7Z",
			fill: "currentColor",
			stroke: "none"
		}),
		pause: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9 5v14" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M15 5v14" })] }),
		step: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m6 5 9 7-9 7Z" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M18 5v14" })] }),
		reset: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 12a8 8 0 1 0 2.34-5.66L4 8.68" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 4v4.68h4.68" })] }),
		upload: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 16V4" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m7 9 5-5 5 5" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5 20h14" })
		] }),
		cube: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m12 3 8 4.5v9L12 21l-8-4.5v-9Z" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m4 7.5 8 4.5 8-4.5M12 12v9" })] }),
		crosshair: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "12",
			cy: "12",
			r: "7"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 2v4M12 18v4M2 12h4M18 12h4" })] }),
		fit: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" }) }),
		zoomIn: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "10.5",
			cy: "10.5",
			r: "6.5"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m16 16 5 5M10.5 7.5v6M7.5 10.5h6" })] }),
		zoomOut: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "10.5",
			cy: "10.5",
			r: "6.5"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m16 16 5 5M7.5 10.5h6" })] }),
		hand: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M7 11V7a2 2 0 0 1 4 0v3-5a2 2 0 0 1 4 0v5-3a2 2 0 0 1 4 0v7c0 4-3 7-7 7h-1c-2.5 0-4-1-5.5-3L3 14.5a2 2 0 0 1 3-2.5Z" }) }),
		ruler: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m4 17 13-13 3 3L7 20H4Z" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m14 7 3 3M11 10l2 2M8 13l3 3" })] }),
		settings: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "12",
			cy: "12",
			r: "3"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.1A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.38.36.72.65 1 .3.26.68.4 1.07.4H21v4h-.1A1.7 1.7 0 0 0 19.4 15Z" })] }),
		sheet: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m3 9 9-5 9 5-9 5Z" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m3 13 9 5 9-5M3 17l9 5 9-5" })] }),
		tool: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9 3h6l-1 6h-4Z" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10.5 9v10l1.5 2 1.5-2V9" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10.5 12h3M10.5 16h3" })
		] }),
		route: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "5",
				cy: "18",
				r: "2"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
				cx: "19",
				cy: "6",
				r: "2"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M7 18c5 0 2-8 7-8h3" })
		] }),
		clock: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "12",
			cy: "12",
			r: "9"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 7v5l3 2" })] }),
		check: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "12",
			cy: "12",
			r: "9"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m8 12 2.5 2.5L16 9" })] }),
		warning: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 3 2.5 20h19Z" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 9v5M12 17.5h.01" })] }),
		edit: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m4 16-.8 4.8L8 20l11-11-4-4Z" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m13 7 4 4" })] }),
		close: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m6 6 12 12M18 6 6 18" }) }),
		info: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
			cx: "12",
			cy: "12",
			r: "9"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 11v5M12 8h.01" })] }),
		panel: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
			x: "3",
			y: "4",
			width: "18",
			height: "16",
			rx: "2"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9 4v16M5.5 8h1M5.5 12h1M5.5 16h1" })] }),
		fullscreen: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" }) }),
		collapse: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 8H3V3M16 8h5V3M8 16H3v5M16 16h5v5" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m3 3 6 6m12-6-6 6M3 21l6-6m12 6-6-6" })] })
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		...common,
		children: paths[name] ?? paths.info
	});
}
function syntaxLine(line) {
	return line.split(/(\([^)]*\)|;.*$|[GM]\d+(?:\.\d+)?|[XYZIJKRQUVWABC][-+]?(?:\d+(?:\.\d*)?|\.\d+)|[FST][-+]?(?:\d+(?:\.\d*)?|\.\d+))/gi).map((chunk, index) => {
		let className = "";
		if (/^\(|^;/.test(chunk)) className = "syntax-comment";
		else if (/^G/i.test(chunk)) className = "syntax-g";
		else if (/^M/i.test(chunk)) className = "syntax-m";
		else if (/^[XYZIJKRQUVWABC]/i.test(chunk)) className = "syntax-axis";
		else if (/^[FST]/i.test(chunk)) className = "syntax-value";
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className,
			children: chunk
		}, `${index}-${chunk}`);
	});
}
function ToolpathCanvas({ simulation, stock, cursor, segmentProgress, playing, view, zoom, pan, orbit, showRapids, onZoom, onPan, onOrbit, onResetView }) {
	const canvasRef = (0, import_react.useRef)(null);
	const frameRef = (0, import_react.useRef)(null);
	const dragRef = (0, import_react.useRef)(null);
	const [size, setSize] = (0, import_react.useState)({
		width: 900,
		height: 600
	});
	const [showBounds, setShowBounds] = (0, import_react.useState)(true);
	const [showTool, setShowTool] = (0, import_react.useState)(true);
	const [showStock, setShowStock] = (0, import_react.useState)(true);
	const [showGrid, setShowGrid] = (0, import_react.useState)(true);
	(0, import_react.useEffect)(() => {
		const element = frameRef.current;
		if (!element) return;
		const observer = new ResizeObserver((entries) => {
			const rect = entries[0]?.contentRect;
			if (rect) setSize({
				width: Math.max(320, Math.round(rect.width)),
				height: Math.max(320, Math.round(rect.height))
			});
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	(0, import_react.useEffect)(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const pixelWidth = Math.round(size.width * dpr);
		const pixelHeight = Math.round(size.height * dpr);
		if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
		if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
		if (canvas.style.width !== `${size.width}px`) canvas.style.width = `${size.width}px`;
		if (canvas.style.height !== `${size.height}px`) canvas.style.height = `${size.height}px`;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const width = size.width;
		const height = size.height;
		ctx.clearRect(0, 0, width, height);
		ctx.fillStyle = "#0c1217";
		ctx.fillRect(0, 0, width, height);
		const originX = stock.originX;
		const originY = stock.originY;
		const originZ = 0;
		const stockBottomZ = originZ - stock.thickness;
		let project;
		let boardCorners;
		let scale;
		let horizontalScale;
		let verticalScale;
		let axisLabels = ["X", "Y"];
		let orbitAxisVector = null;
		let stockSideFaces = [];
		const sideView = view === "xoz" || view === "yoz";
		if (view !== "iso") {
			const zMin = Math.min(stockBottomZ, simulation.bounds.minZ);
			const zMax = Math.max(originZ, stock.safeZ, simulation.bounds.maxZ);
			const uMin = view === "yoz" ? Math.min(originY, simulation.bounds.minY) : Math.min(originX, simulation.bounds.minX);
			const uMax = view === "yoz" ? Math.max(originY + stock.height, simulation.bounds.maxY) : Math.max(originX + stock.width, simulation.bounds.maxX);
			const vMin = view === "xoy" ? Math.min(originY, simulation.bounds.minY) : zMin;
			const vMax = view === "xoy" ? Math.max(originY + stock.height, simulation.bounds.maxY) : zMax;
			const uSpan = Math.max(1, uMax - uMin);
			const vSpan = Math.max(1, vMax - vMin);
			const fitWidth = Math.max(160, width - 110);
			const fitHeight = Math.max(160, height - 110);
			if (sideView) {
				horizontalScale = fitWidth / uSpan * zoom;
				verticalScale = fitHeight / vSpan * zoom;
			} else {
				const uniformScale = Math.min(fitWidth / uSpan, fitHeight / vSpan) * zoom;
				horizontalScale = uniformScale;
				verticalScale = uniformScale;
			}
			scale = Math.min(horizontalScale, verticalScale);
			const left = (width - uSpan * horizontalScale) / 2 + pan.x;
			const top = (height - vSpan * verticalScale) / 2 + pan.y + 6;
			const readU = (point) => view === "yoz" ? point.y : point.x;
			const readV = (point) => view === "xoy" ? point.y : point.z;
			project = (point) => ({
				x: left + (readU(point) - uMin) * horizontalScale,
				y: top + (vMax - readV(point)) * verticalScale
			});
			if (view === "xoy") {
				axisLabels = ["X", "Y"];
				boardCorners = [
					project({
						x: originX,
						y: originY + stock.height,
						z: originZ
					}),
					project({
						x: originX + stock.width,
						y: originY + stock.height,
						z: originZ
					}),
					project({
						x: originX + stock.width,
						y: originY,
						z: originZ
					}),
					project({
						x: originX,
						y: originY,
						z: originZ
					})
				];
			} else if (view === "xoz") {
				axisLabels = ["X", "Z"];
				boardCorners = [
					project({
						x: originX,
						y: originY,
						z: originZ
					}),
					project({
						x: originX + stock.width,
						y: originY,
						z: originZ
					}),
					project({
						x: originX + stock.width,
						y: originY,
						z: stockBottomZ
					}),
					project({
						x: originX,
						y: originY,
						z: stockBottomZ
					})
				];
			} else if (view === "yoz") {
				axisLabels = ["Y", "Z"];
				boardCorners = [
					project({
						x: originX,
						y: originY,
						z: originZ
					}),
					project({
						x: originX,
						y: originY + stock.height,
						z: originZ
					}),
					project({
						x: originX,
						y: originY + stock.height,
						z: stockBottomZ
					}),
					project({
						x: originX,
						y: originY,
						z: stockBottomZ
					})
				];
			}
		} else {
			axisLabels = ["X", "Y"];
			const xMin = Math.min(originX, simulation.bounds.minX);
			const xMax = Math.max(originX + stock.width, simulation.bounds.maxX);
			const yMin = Math.min(originY, simulation.bounds.minY);
			const yMax = Math.max(originY + stock.height, simulation.bounds.maxY);
			const zMin = Math.min(stockBottomZ, simulation.bounds.minZ);
			const zMax = Math.max(originZ, stock.safeZ, simulation.bounds.maxZ);
			const center = {
				x: (xMin + xMax) / 2,
				y: (yMin + yMax) / 2,
				z: (zMin + zMax) / 2
			};
			const zVisualScale = Math.max(1, Math.min(6, Math.max(stock.width, stock.height) / Math.max(1, stock.thickness) * .025));
			const cosYaw = Math.cos(orbit.yaw);
			const sinYaw = Math.sin(orbit.yaw);
			const cosPitch = Math.cos(orbit.pitch);
			const sinPitch = Math.sin(orbit.pitch);
			const rotateVector = (vector) => {
				const x = vector.x;
				const y = vector.y;
				const z = vector.z * zVisualScale;
				const rotatedX = cosYaw * x - sinYaw * y;
				const rotatedY = sinYaw * x + cosYaw * y;
				return {
					u: rotatedX,
					v: rotatedY * sinPitch - z * cosPitch,
					depth: rotatedY * cosPitch + z * sinPitch
				};
			};
			const rotatePoint = (point) => rotateVector({
				x: point.x - center.x,
				y: point.y - center.y,
				z: point.z - center.z
			});
			const fitPoints = [];
			[xMin, xMax].forEach((x) => {
				[yMin, yMax].forEach((y) => {
					[zMin, zMax].forEach((z) => fitPoints.push({
						x,
						y,
						z
					}));
				});
			});
			const rotatedFit = fitPoints.map(rotatePoint);
			const minU = Math.min(...rotatedFit.map((point) => point.u));
			const maxU = Math.max(...rotatedFit.map((point) => point.u));
			const minV = Math.min(...rotatedFit.map((point) => point.v));
			const maxV = Math.max(...rotatedFit.map((point) => point.v));
			const centerU = (minU + maxU) / 2;
			const centerV = (minV + maxV) / 2;
			const fitWidth = Math.max(180, width - 150);
			const fitHeight = Math.max(180, height - 130);
			scale = Math.min(fitWidth / Math.max(1, maxU - minU), fitHeight / Math.max(1, maxV - minV)) * zoom;
			horizontalScale = scale;
			verticalScale = scale;
			project = (point) => {
				const rotated = rotatePoint(point);
				return {
					x: width / 2 + (rotated.u - centerU) * scale + pan.x,
					y: height / 2 + (rotated.v - centerV) * scale + pan.y
				};
			};
			orbitAxisVector = (vector) => {
				const rotated = rotateVector(vector);
				return {
					x: rotated.u,
					y: rotated.v
				};
			};
			const stockTop = [
				{
					x: originX,
					y: originY,
					z: originZ
				},
				{
					x: originX + stock.width,
					y: originY,
					z: originZ
				},
				{
					x: originX + stock.width,
					y: originY + stock.height,
					z: originZ
				},
				{
					x: originX,
					y: originY + stock.height,
					z: originZ
				}
			];
			const stockBottom = stockTop.map((point) => ({
				...point,
				z: stockBottomZ
			}));
			boardCorners = stockTop.map(project);
			stockSideFaces = [
				{
					points: [
						stockTop[0],
						stockTop[1],
						stockBottom[1],
						stockBottom[0]
					],
					fill: "#4c555c"
				},
				{
					points: [
						stockTop[1],
						stockTop[2],
						stockBottom[2],
						stockBottom[1]
					],
					fill: "#3e474d"
				},
				{
					points: [
						stockTop[2],
						stockTop[3],
						stockBottom[3],
						stockBottom[2]
					],
					fill: "#465057"
				},
				{
					points: [
						stockTop[3],
						stockTop[0],
						stockBottom[0],
						stockBottom[3]
					],
					fill: "#596269"
				}
			].map((face) => ({
				...face,
				depth: face.points.reduce((sum, point) => sum + rotatePoint(point).depth, 0) / face.points.length
			})).sort((a, b) => a.depth - b.depth);
		}
		const drawPolygon = (points, fill, stroke, lineWidth = 1) => {
			if (!points.length) return;
			ctx.beginPath();
			ctx.moveTo(points[0].x, points[0].y);
			points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
			ctx.closePath();
			ctx.fillStyle = fill;
			ctx.fill();
			ctx.strokeStyle = stroke;
			ctx.lineWidth = lineWidth;
			ctx.stroke();
		};
		const shouldDrawStock = view !== "iso" || showStock;
		if (view === "iso" && shouldDrawStock) {
			stockSideFaces.forEach((face) => {
				drawPolygon(face.points.map(project), face.fill, "rgba(190,205,214,.62)", .8);
			});
			drawPolygon(boardCorners, "#6f797f", "#c0cbd1", 1.15);
		} else if (shouldDrawStock) drawPolygon(boardCorners, "#b9905d", "#d1a56b", 1.2);
		if (shouldDrawStock) {
			ctx.save();
			ctx.beginPath();
			ctx.moveTo(boardCorners[0].x, boardCorners[0].y);
			boardCorners.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
			ctx.closePath();
			ctx.clip();
			const grainLines = view === "iso" ? 18 : sideView ? 14 : 32;
			for (let index = 0; index < grainLines; index += 1) {
				const ratio = (index + .5) / grainLines;
				const from = view === "xoz" ? project({
					x: originX,
					y: originY,
					z: -ratio * stock.thickness
				}) : view === "yoz" ? project({
					x: originX,
					y: originY,
					z: -ratio * stock.thickness
				}) : project({
					x: originX,
					y: originY + ratio * stock.height,
					z: originZ
				});
				const to = view === "xoz" ? project({
					x: originX + stock.width,
					y: originY,
					z: -ratio * stock.thickness
				}) : view === "yoz" ? project({
					x: originX,
					y: originY + stock.height,
					z: -ratio * stock.thickness
				}) : project({
					x: originX + stock.width,
					y: originY + ratio * stock.height,
					z: originZ
				});
				ctx.beginPath();
				ctx.moveTo(from.x, from.y);
				ctx.bezierCurveTo(from.x + (to.x - from.x) * .28, from.y + Math.sin(index * 1.7) * 3, from.x + (to.x - from.x) * .68, to.y + Math.cos(index * 1.3) * 3, to.x, to.y);
				ctx.strokeStyle = view === "iso" ? index % 3 === 0 ? "rgba(11,21,27,.18)" : "rgba(235,244,248,.08)" : index % 3 === 0 ? "rgba(66,38,18,.18)" : "rgba(255,232,191,.1)";
				ctx.lineWidth = view === "iso" ? .65 : index % 5 === 0 ? 1.2 : .65;
				ctx.stroke();
			}
			const gridStep = stock.width > 3e3 ? 500 : 200;
			ctx.setLineDash([]);
			const drawGridLine = (from, to, stronger = false) => {
				const projectedFrom = project(from);
				const projectedTo = project(to);
				ctx.beginPath();
				ctx.moveTo(projectedFrom.x, projectedFrom.y);
				ctx.lineTo(projectedTo.x, projectedTo.y);
				ctx.strokeStyle = stronger ? "rgba(13,30,38,.28)" : "rgba(13,30,38,.14)";
				ctx.lineWidth = stronger ? 1 : .7;
				ctx.stroke();
			};
			if (view === "xoy" || view === "iso" && showGrid) {
				for (let x = Math.ceil(originX / gridStep) * gridStep; x <= originX + stock.width; x += gridStep) drawGridLine({
					x,
					y: originY,
					z: originZ
				}, {
					x,
					y: originY + stock.height,
					z: originZ
				});
				for (let y = Math.ceil(originY / gridStep) * gridStep; y <= originY + stock.height; y += gridStep) drawGridLine({
					x: originX,
					y,
					z: originZ
				}, {
					x: originX + stock.width,
					y,
					z: originZ
				});
			} else if (view === "xoz") {
				for (let x = Math.ceil(originX / gridStep) * gridStep; x <= originX + stock.width; x += gridStep) drawGridLine({
					x,
					y: originY,
					z: stockBottomZ
				}, {
					x,
					y: originY,
					z: originZ
				});
				for (let z = -Math.floor(stock.thickness / 5) * 5; z <= 0; z += 5) drawGridLine({
					x: originX,
					y: originY,
					z
				}, {
					x: originX + stock.width,
					y: originY,
					z
				}, z === 0);
			} else if (view === "yoz") {
				for (let y = Math.ceil(originY / gridStep) * gridStep; y <= originY + stock.height; y += gridStep) drawGridLine({
					x: originX,
					y,
					z: stockBottomZ
				}, {
					x: originX,
					y,
					z: originZ
				});
				for (let z = -Math.floor(stock.thickness / 5) * 5; z <= 0; z += 5) drawGridLine({
					x: originX,
					y: originY,
					z
				}, {
					x: originX,
					y: originY + stock.height,
					z
				}, z === 0);
			}
			ctx.restore();
		}
		if (view === "xoy") simulation.parts.forEach((part) => {
			const points = part.points.map(project);
			if (points.length < 3) return;
			ctx.beginPath();
			ctx.moveTo(points[0].x, points[0].y);
			points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
			ctx.closePath();
			ctx.fillStyle = "rgba(255,245,220,.08)";
			ctx.fill();
			ctx.strokeStyle = "rgba(15,40,45,.42)";
			ctx.lineWidth = 1;
			ctx.stroke();
			const center = project({
				x: (part.minX + part.maxX) / 2,
				y: (part.minY + part.maxY) / 2,
				z: 0
			});
			ctx.font = `600 ${Math.max(10, Math.min(16, scale * 22))}px "Arial Narrow", Arial`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillStyle = "rgba(39,28,18,.72)";
			ctx.fillText(part.id, center.x, center.y - 6);
			ctx.font = `500 ${Math.max(8, Math.min(11, scale * 15))}px ui-monospace, monospace`;
			ctx.fillStyle = "rgba(39,28,18,.55)";
			ctx.fillText(`${Math.round(part.width)} × ${Math.round(part.height)}`, center.x, center.y + 10);
		});
		const drawPath = (segment, points, alpha, active = false) => {
			if (points.length < 2) {
				if (segment.kind === "drill") {
					const point = project(segment.end);
					ctx.beginPath();
					ctx.arc(point.x, point.y, Math.max(3.5, stock.toolDiameter * scale * .5), 0, Math.PI * 2);
					ctx.strokeStyle = `rgba(174,103,255,${alpha})`;
					ctx.lineWidth = active ? 2.5 : 1.4;
					ctx.stroke();
					ctx.beginPath();
					ctx.moveTo(point.x - 4, point.y);
					ctx.lineTo(point.x + 4, point.y);
					ctx.moveTo(point.x, point.y - 4);
					ctx.lineTo(point.x, point.y + 4);
					ctx.stroke();
				}
				return;
			}
			const projected = points.map(project);
			const isRapid = segment.kind === "rapid";
			const color = isRapid ? "255,138,31" : view === "iso" ? "91,238,198" : "38,217,232";
			if (!isRapid && active) {
				ctx.beginPath();
				ctx.moveTo(projected[0].x, projected[0].y);
				projected.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
				ctx.strokeStyle = view === "iso" ? `rgba(8,15,18,${Math.min(.72, alpha * .72)})` : `rgba(38,217,232,${Math.min(.16, alpha * .16)})`;
				ctx.lineWidth = view === "iso" ? Math.max(3.5, stock.toolDiameter * scale * 1.15) : Math.max(3, stock.toolDiameter * scale);
				ctx.lineCap = "round";
				ctx.lineJoin = "round";
				ctx.stroke();
			}
			ctx.beginPath();
			ctx.moveTo(projected[0].x, projected[0].y);
			projected.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
			ctx.strokeStyle = `rgba(${color},${alpha})`;
			ctx.lineWidth = view === "iso" ? active ? 2 : isRapid ? 1 : 1.25 : active ? 2.2 : isRapid ? 1.15 : 1.45;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
			ctx.setLineDash(isRapid ? [7, 5] : []);
			ctx.stroke();
			ctx.setLineDash([]);
			if (!isRapid && active && distance2(segment.start, segment.end) > 140 && projected.length >= 2) {
				const midIndex = Math.floor(projected.length / 2);
				const before = projected[Math.max(0, midIndex - 1)];
				const at = projected[midIndex];
				const angle = Math.atan2(at.y - before.y, at.x - before.x);
				ctx.save();
				ctx.translate(at.x, at.y);
				ctx.rotate(angle);
				ctx.beginPath();
				ctx.moveTo(5, 0);
				ctx.lineTo(-4, -3.5);
				ctx.lineTo(-4, 3.5);
				ctx.closePath();
				ctx.fillStyle = `rgba(${color},${alpha})`;
				ctx.fill();
				ctx.restore();
			}
		};
		simulation.segments.forEach((segment, index) => {
			if (!showRapids && segment.kind === "rapid") return;
			const isFuture = index > cursor;
			const isCompleted = index < cursor;
			const isCurrent = index === cursor;
			if (isFuture) drawPath(segment, segment.points, .2);
			else if (isCompleted) drawPath(segment, segment.points, .88, true);
			else if (isCurrent) {
				drawPath(segment, segment.points, .22);
				drawPath(segment, partialPoints(segment, segmentProgress), 1, true);
			}
		});
		if (view === "iso" && showBounds) {
			const x0 = simulation.bounds.minX;
			const x1 = simulation.bounds.maxX;
			const y0 = simulation.bounds.minY;
			const y1 = simulation.bounds.maxY;
			const z0 = Math.min(simulation.bounds.minZ, stockBottomZ);
			const z1 = Math.max(simulation.bounds.maxZ, originZ);
			const corners = [
				{
					x: x0,
					y: y0,
					z: z0
				},
				{
					x: x1,
					y: y0,
					z: z0
				},
				{
					x: x1,
					y: y1,
					z: z0
				},
				{
					x: x0,
					y: y1,
					z: z0
				},
				{
					x: x0,
					y: y0,
					z: z1
				},
				{
					x: x1,
					y: y0,
					z: z1
				},
				{
					x: x1,
					y: y1,
					z: z1
				},
				{
					x: x0,
					y: y1,
					z: z1
				}
			].map(project);
			const edges = [
				[0, 1],
				[1, 2],
				[2, 3],
				[3, 0],
				[4, 5],
				[5, 6],
				[6, 7],
				[7, 4],
				[0, 4],
				[1, 5],
				[2, 6],
				[3, 7]
			];
			ctx.save();
			ctx.setLineDash([5, 5]);
			ctx.strokeStyle = "rgba(129,167,189,.34)";
			ctx.lineWidth = .85;
			edges.forEach(([from, to]) => {
				ctx.beginPath();
				ctx.moveTo(corners[from].x, corners[from].y);
				ctx.lineTo(corners[to].x, corners[to].y);
				ctx.stroke();
			});
			ctx.restore();
		}
		const topLeft = boardCorners[0];
		const topRight = boardCorners[1];
		const bottomLeft = boardCorners[3];
		ctx.strokeStyle = "rgba(220,230,236,.72)";
		ctx.fillStyle = "rgba(225,233,238,.88)";
		ctx.lineWidth = 1;
		ctx.setLineDash([]);
		ctx.font = "500 11px ui-monospace, \"SFMono-Regular\", monospace";
		ctx.textAlign = "center";
		ctx.textBaseline = "bottom";
		if (view !== "iso") {
			const dimY = Math.min(topLeft.y, topRight.y) - 18;
			const horizontalDimension = view === "yoz" ? stock.height : stock.width;
			ctx.beginPath();
			ctx.moveTo(topLeft.x, dimY);
			ctx.lineTo(topRight.x, dimY);
			ctx.stroke();
			ctx.fillText(`${horizontalDimension.toFixed(0)} mm`, (topLeft.x + topRight.x) / 2, dimY - 4);
			const verticalDimension = view === "xoy" ? stock.height : stock.thickness;
			const dimX = bottomLeft.x - 22;
			ctx.save();
			ctx.translate(dimX - 5, (topLeft.y + bottomLeft.y) / 2);
			ctx.rotate(-Math.PI / 2);
			ctx.fillText(`${verticalDimension.toFixed(0)} mm`, 0, 0);
			ctx.restore();
			ctx.beginPath();
			ctx.moveTo(dimX, topLeft.y);
			ctx.lineTo(dimX, bottomLeft.y);
			ctx.stroke();
		}
		const activeSegment = simulation.segments[Math.min(cursor, simulation.segments.length - 1)];
		const toolPosition = activeSegment ? pointOnSegment(activeSegment, segmentProgress) : {
			x: stock.originX,
			y: stock.originY,
			z: stock.safeZ
		};
		const toolPoint = project(toolPosition);
		if (view === "iso" && showTool) {
			const fluteLength = Math.max(38, stock.thickness * 2.2);
			const holderLength = Math.max(28, stock.thickness * 1.6);
			const shankTop = project({
				...toolPosition,
				z: toolPosition.z + fluteLength
			});
			const holderTop = project({
				...toolPosition,
				z: toolPosition.z + fluteLength + holderLength
			});
			ctx.save();
			ctx.lineCap = "round";
			ctx.beginPath();
			ctx.moveTo(shankTop.x, shankTop.y);
			ctx.lineTo(holderTop.x, holderTop.y);
			ctx.strokeStyle = "#aeb8be";
			ctx.lineWidth = 14;
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(toolPoint.x, toolPoint.y);
			ctx.lineTo(shankTop.x, shankTop.y);
			ctx.strokeStyle = "#e8b84f";
			ctx.lineWidth = 6;
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(shankTop.x, shankTop.y, 6.5, 0, Math.PI * 2);
			ctx.fillStyle = "#d6dde0";
			ctx.fill();
			ctx.strokeStyle = "#637078";
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(toolPoint.x, toolPoint.y, 3.5, 0, Math.PI * 2);
			ctx.fillStyle = "#f6d06d";
			ctx.fill();
			ctx.strokeStyle = "#172027";
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.font = "700 9px ui-monospace, \"SFMono-Regular\", monospace";
			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			ctx.fillStyle = "rgba(227,235,239,.86)";
			ctx.fillText(activeSegment?.tool && activeSegment.tool !== "—" ? activeSegment.tool : "TOOL", holderTop.x + 11, holderTop.y);
			ctx.restore();
		} else if (view !== "iso") {
			ctx.beginPath();
			ctx.arc(toolPoint.x, toolPoint.y, 9, 0, Math.PI * 2);
			ctx.fillStyle = "rgba(12,18,23,.88)";
			ctx.fill();
			ctx.strokeStyle = "#26d9e8";
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(toolPoint.x - 15, toolPoint.y);
			ctx.lineTo(toolPoint.x + 15, toolPoint.y);
			ctx.moveTo(toolPoint.x, toolPoint.y - 15);
			ctx.lineTo(toolPoint.x, toolPoint.y + 15);
			ctx.strokeStyle = "rgba(38,217,232,.86)";
			ctx.lineWidth = 1;
			ctx.stroke();
		}
		const axisOrigin = {
			x: 34,
			y: height - 30
		};
		const axisColors = {
			X: "#ff5f5f",
			Y: "#72df61",
			Z: "#5aa9ff"
		};
		ctx.font = "600 11px ui-monospace, monospace";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.lineWidth = 2;
		if (view === "iso" && orbitAxisVector) {
			[
				["X", {
					x: 1,
					y: 0,
					z: 0
				}],
				["Y", {
					x: 0,
					y: 1,
					z: 0
				}],
				["Z", {
					x: 0,
					y: 0,
					z: 1
				}]
			].forEach(([label, vector]) => {
				const projectedVector = orbitAxisVector?.(vector) ?? {
					x: 0,
					y: 0
				};
				const vectorLength = Math.max(.001, Math.hypot(projectedVector.x, projectedVector.y));
				const end = {
					x: axisOrigin.x + projectedVector.x / vectorLength * 33,
					y: axisOrigin.y + projectedVector.y / vectorLength * 33
				};
				ctx.beginPath();
				ctx.moveTo(axisOrigin.x, axisOrigin.y);
				ctx.lineTo(end.x, end.y);
				ctx.strokeStyle = axisColors[label];
				ctx.stroke();
				ctx.fillStyle = axisColors[label];
				ctx.fillText(label, end.x + projectedVector.x / vectorLength * 8, end.y + projectedVector.y / vectorLength * 8);
			});
			ctx.beginPath();
			ctx.arc(axisOrigin.x, axisOrigin.y, 2.6, 0, Math.PI * 2);
			ctx.fillStyle = "#d7e0e5";
			ctx.fill();
		} else {
			ctx.beginPath();
			ctx.moveTo(axisOrigin.x, axisOrigin.y);
			ctx.lineTo(axisOrigin.x + 32, axisOrigin.y);
			ctx.strokeStyle = axisColors[axisLabels[0]];
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(axisOrigin.x, axisOrigin.y);
			ctx.lineTo(axisOrigin.x, axisOrigin.y - 32);
			ctx.strokeStyle = axisColors[axisLabels[1]];
			ctx.stroke();
			ctx.fillStyle = axisColors[axisLabels[0]];
			ctx.fillText(axisLabels[0], axisOrigin.x + 38, axisOrigin.y);
			ctx.fillStyle = axisColors[axisLabels[1]];
			ctx.fillText(axisLabels[1], axisOrigin.x, axisOrigin.y - 39);
		}
	}, [
		simulation,
		stock,
		cursor,
		segmentProgress,
		view,
		zoom,
		pan,
		orbit,
		showRapids,
		showBounds,
		showTool,
		showStock,
		showGrid,
		size
	]);
	const handlePointerDown = (event) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		dragRef.current = {
			x: event.clientX,
			y: event.clientY,
			panX: pan.x,
			panY: pan.y,
			yaw: orbit.yaw,
			pitch: orbit.pitch,
			mode: view === "iso" && event.button === 0 && !event.shiftKey ? "orbit" : "pan"
		};
	};
	const handlePointerMove = (event) => {
		if (!dragRef.current) return;
		if (dragRef.current.mode === "orbit") {
			onOrbit({
				yaw: dragRef.current.yaw + (event.clientX - dragRef.current.x) * .009,
				pitch: Math.max(.12, Math.min(1.42, dragRef.current.pitch - (event.clientY - dragRef.current.y) * .009))
			});
			return;
		}
		onPan({
			x: dragRef.current.panX + event.clientX - dragRef.current.x,
			y: dragRef.current.panY + event.clientY - dragRef.current.y
		});
	};
	const handlePointerUp = (event) => {
		if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
		dragRef.current = null;
	};
	const handleWheel = (event) => {
		event.preventDefault();
		const factor = event.deltaY < 0 ? 1.12 : .89;
		onZoom(Math.max(.35, Math.min(6, zoom * factor)));
	};
	const currentSegment = simulation.segments[Math.min(cursor, simulation.segments.length - 1)];
	const currentPosition = currentSegment ? pointOnSegment(currentSegment, segmentProgress) : {
		x: stock.originX,
		y: stock.originY,
		z: stock.safeZ
	};
	const completedMoves = simulation.segments.length ? Math.min(simulation.segments.length, Math.max(0, cursor + segmentProgress)) : 0;
	const progressRatio = simulation.segments.length ? completedMoves / simulation.segments.length : 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: `canvas-frame${view === "iso" ? " is-3d" : ""}`,
		ref: frameRef,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "active-command-hud",
				"aria-hidden": "true",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "command-mode",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: motionLabel(currentSegment) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
						"BLOCK ",
						currentSegment?.lineNumber ?? 0,
						" · MOVE",
						" ",
						Math.min(cursor + 1, simulation.segments.length),
						"/",
						simulation.segments.length
					] })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: currentSegment?.raw.trim() || "—" })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "plane-badge",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: VIEW_META[view].short }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: VIEW_META[view].title }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: VIEW_META[view].description })
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "canvas-telemetry",
				"aria-label": `Tọa độ dao X ${currentPosition.x.toFixed(3)}, Y ${currentPosition.y.toFixed(3)}, Z ${currentPosition.z.toFixed(3)}`,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: `telemetry-state${playing ? " is-running" : ""}`,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}), playing ? "RUN" : "READY"]
					}),
					[
						"x",
						"y",
						"z"
					].map((axis) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: `telemetry-axis is-${axis}`,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: axis.toUpperCase() }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: currentPosition[axis].toFixed(3) })]
					}, axis)),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "telemetry-meta",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "FEED" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: ["F", currentSegment?.feed.toFixed(0) ?? "0"] })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "telemetry-meta",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "SPINDLE" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: ["S", currentSegment?.spindle.toFixed(0) ?? "0"] })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "telemetry-meta",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "TIME" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: formatTime(simulation.estimatedSeconds * progressRatio) })]
					})
				]
			}),
			view === "iso" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "orientation-widget",
					onClick: onResetView,
					"aria-label": "Đặt lại hướng camera 3D",
					title: "Nhấn để đặt lại camera 3D",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "cube-shell",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "cube-core",
							style: { transform: `rotateX(${58 - orbit.pitch * 180 / Math.PI}deg) rotateZ(${orbit.yaw * 180 / Math.PI - 45}deg)` },
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
									className: "cube-face cube-front",
									children: "X+"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
									className: "cube-face cube-back",
									children: "X−"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
									className: "cube-face cube-right",
									children: "Y+"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
									className: "cube-face cube-left",
									children: "Y−"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
									className: "cube-face cube-top",
									children: "Z+"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
									className: "cube-face cube-bottom",
									children: "Z−"
								})
							]
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "ORBIT" })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "backplot-controls",
					"aria-label": "Tùy chọn 3D Backplot",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: showStock ? "is-active" : "",
							"aria-pressed": showStock,
							onClick: () => setShowStock((value) => !value),
							children: "PHÔI"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: showTool ? "is-active" : "",
							"aria-pressed": showTool,
							onClick: () => setShowTool((value) => !value),
							children: "DAO"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: showBounds ? "is-active" : "",
							"aria-pressed": showBounds,
							onClick: () => setShowBounds((value) => !value),
							children: "KHUNG"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: showGrid ? "is-active" : "",
							"aria-pressed": showGrid,
							onClick: () => setShowGrid((value) => !value),
							children: "LƯỚI"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: onResetView,
							children: "ĐẶT LẠI"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "orbit-hint",
					"aria-hidden": "true",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Chuột trái: xoay" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Shift/chuột phải: pan" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Con lăn: zoom" })
					]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
				ref: canvasRef,
				"aria-label": `Mô phỏng đường chạy dao CNC · ${VIEW_META[view].title}`,
				onPointerDown: handlePointerDown,
				onPointerMove: handlePointerMove,
				onPointerUp: handlePointerUp,
				onPointerCancel: handlePointerUp,
				onWheel: handleWheel,
				onDoubleClick: onResetView,
				onContextMenu: (event) => event.preventDefault()
			})
		]
	});
}
function MetricCard({ icon, label, children, detail, tone, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(onClick ? "button" : "div", {
		className: `metric-card${tone ? ` is-${tone}` : ""}${onClick ? " is-clickable" : ""}`,
		onClick,
		type: onClick ? "button" : void 0,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "metric-heading",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
					name: icon,
					size: 20
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "metric-value",
				children
			}),
			detail && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "metric-detail",
				children: detail
			})
		]
	});
}
function ToolbarButton({ icon, label, onClick, active }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		className: `icon-button${active ? " is-active" : ""}`,
		onClick,
		"aria-label": label,
		title: label,
		type: "button",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
			name: icon,
			size: 19
		})
	});
}
function Home() {
	const [code, setCode] = (0, import_react.useState)(SAMPLE_GCODE);
	const [draftCode, setDraftCode] = (0, import_react.useState)(SAMPLE_GCODE);
	const [fileName, setFileName] = (0, import_react.useState)("tu-bep-can-a01.nc");
	const [projectName, setProjectName] = (0, import_react.useState)("Tủ bếp căn A-01");
	const [stock, setStock] = (0, import_react.useState)(DEFAULT_STOCK);
	const [profile, setProfile] = (0, import_react.useState)("router-custom");
	const [view, setView] = (0, import_react.useState)("xoy");
	const [cursor, setCursor] = (0, import_react.useState)(0);
	const [segmentProgress, setSegmentProgress] = (0, import_react.useState)(0);
	const [playing, setPlaying] = (0, import_react.useState)(false);
	const [speed, setSpeed] = (0, import_react.useState)(2);
	const [zoom, setZoom] = (0, import_react.useState)(1);
	const [pan, setPan] = (0, import_react.useState)({
		x: 0,
		y: 0
	});
	const [orbit, setOrbit] = (0, import_react.useState)({ ...DEFAULT_ORBIT });
	const [showRapids, setShowRapids] = (0, import_react.useState)(false);
	const [codeCollapsed, setCodeCollapsed] = (0, import_react.useState)(false);
	const [simulatorExpanded, setSimulatorExpanded] = (0, import_react.useState)(false);
	const [drawer, setDrawer] = (0, import_react.useState)(null);
	const [settingsOpen, setSettingsOpen] = (0, import_react.useState)(false);
	const [editorOpen, setEditorOpen] = (0, import_react.useState)(false);
	const [dragActive, setDragActive] = (0, import_react.useState)(false);
	const [toast, setToast] = (0, import_react.useState)(null);
	const fileInputRef = (0, import_react.useRef)(null);
	const codeScrollRef = (0, import_react.useRef)(null);
	const appRef = (0, import_react.useRef)(null);
	const simulation = (0, import_react.useMemo)(() => parseProgram(code, stock, profile), [
		code,
		stock,
		profile
	]);
	const errorCount = simulation.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
	const warningCount = simulation.diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
	const activeSegment = simulation.segments[Math.min(cursor, Math.max(0, simulation.segments.length - 1))];
	const currentPosition = activeSegment ? pointOnSegment(activeSegment, segmentProgress) : {
		x: stock.originX,
		y: stock.originY,
		z: stock.safeZ
	};
	const currentLine = activeSegment?.lineIndex ?? 0;
	const totalProgress = simulation.segments.length ? Math.max(0, Math.min(100, (Math.min(cursor, simulation.segments.length) + segmentProgress) / simulation.segments.length * 100)) : 0;
	const notify = (0, import_react.useCallback)((message) => {
		setToast(message);
		window.setTimeout(() => setToast(null), 2600);
	}, []);
	const resetPlayback = (0, import_react.useCallback)(() => {
		setPlaying(false);
		setCursor(0);
		setSegmentProgress(0);
	}, []);
	const resetView = (0, import_react.useCallback)(() => {
		setZoom(1);
		setPan({
			x: 0,
			y: 0
		});
		setOrbit({ ...DEFAULT_ORBIT });
	}, []);
	const changeView = (0, import_react.useCallback)((nextView) => {
		setView(nextView);
		setZoom(1);
		setPan({
			x: 0,
			y: 0
		});
		if (nextView === "iso") setOrbit({ ...DEFAULT_ORBIT });
	}, []);
	const applyCode = (0, import_react.useCallback)((nextCode, nextFileName) => {
		const oriented = orientStockForProgram(nextCode, stock, profile);
		if (oriented.rotated) setStock(oriented.stock);
		setCode(nextCode);
		setDraftCode(nextCode);
		if (nextFileName) {
			setFileName(nextFileName);
			setProjectName(nextFileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
		}
		resetPlayback();
		setZoom(1);
		setPan({
			x: 0,
			y: 0
		});
		setOrbit({ ...DEFAULT_ORBIT });
		return oriented.rotated;
	}, [
		profile,
		resetPlayback,
		stock
	]);
	const readFile = (0, import_react.useCallback)(async (file) => {
		if (file.size > 8 * 1024 * 1024) {
			notify("File lớn hơn 8 MB. Hãy chia chương trình trước khi nhập.");
			return;
		}
		const extension = file.name.split(".").pop()?.toLowerCase();
		if (!extension || ![
			"nc",
			"txt",
			"tap",
			"gcode",
			"cnc"
		].includes(extension)) {
			notify("Định dạng chưa hỗ trợ. Dùng .NC, .TXT, .TAP, .GCODE hoặc .CNC.");
			return;
		}
		notify(applyCode(await file.text(), file.name) ? `Đã đọc ${file.name} và tự xoay phôi sang ${stock.height.toFixed(0)} × ${stock.width.toFixed(0)} mm.` : `Đã đọc ${file.name} hoàn toàn trên trình duyệt.`);
	}, [
		applyCode,
		notify,
		stock.height,
		stock.width
	]);
	const handleFileInput = (event) => {
		const file = event.target.files?.[0];
		if (file) readFile(file);
		event.target.value = "";
	};
	const seekToLine = (0, import_react.useCallback)((lineIndex) => {
		const target = simulation.segments.findIndex((segment) => segment.lineIndex >= lineIndex);
		if (target >= 0) {
			setPlaying(false);
			setCursor(target);
			setSegmentProgress(0);
		}
		setDrawer(null);
	}, [simulation.segments]);
	const stepForward = (0, import_react.useCallback)(() => {
		setPlaying(false);
		if (!simulation.segments.length) return;
		setSegmentProgress(0);
		setCursor((current) => current >= simulation.segments.length - 1 ? 0 : current + 1);
	}, [simulation.segments.length]);
	(0, import_react.useEffect)(() => {
		if (!playing || !simulation.segments.length) return;
		let animationFrame = 0;
		let previousTime = performance.now();
		const tick = (now) => {
			const delta = Math.min(80, now - previousTime);
			previousTime = now;
			const segment = simulation.segments[Math.min(cursor, simulation.segments.length - 1)];
			if (!segment) {
				setPlaying(false);
				return;
			}
			const nominalFeed = segment.kind === "rapid" ? stock.rapidFeed : Math.max(1, segment.feed || 1e3);
			const realDuration = segment.length / nominalFeed * 60 * 1e3;
			const displayDuration = Math.max(180, Math.min(1500, realDuration / speed));
			const increment = displayDuration > 0 ? delta / displayDuration : 1;
			setSegmentProgress((current) => {
				const next = current + increment;
				if (next >= 1) {
					if (cursor >= simulation.segments.length - 1) {
						setPlaying(false);
						return 1;
					}
					setCursor((index) => Math.min(index + 1, simulation.segments.length - 1));
					return 0;
				}
				return next;
			});
			animationFrame = window.requestAnimationFrame(tick);
		};
		animationFrame = window.requestAnimationFrame(tick);
		return () => window.cancelAnimationFrame(animationFrame);
	}, [
		playing,
		cursor,
		simulation.segments,
		speed,
		stock.rapidFeed
	]);
	(0, import_react.useEffect)(() => {
		document.querySelector(`[data-code-line="${currentLine}"]`)?.scrollIntoView({ block: "nearest" });
	}, [currentLine]);
	(0, import_react.useEffect)(() => {
		const handleKeyDown = (event) => {
			const target = event.target;
			if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") return;
			if (event.code === "Space" || event.code === "F5") {
				event.preventDefault();
				setPlaying((value) => !value);
			} else if (event.code === "F10") {
				event.preventDefault();
				stepForward();
			} else if (event.code === "F8") {
				event.preventDefault();
				resetPlayback();
			} else if (event.code === "Digit1") changeView("xoy");
			else if (event.code === "Digit2") changeView("xoz");
			else if (event.code === "Digit3") changeView("yoz");
			else if (event.code === "Digit4") changeView("iso");
			else if (event.code === "Escape" && simulatorExpanded && !document.fullscreenElement) setSimulatorExpanded(false);
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [
		changeView,
		resetPlayback,
		simulatorExpanded,
		stepForward
	]);
	(0, import_react.useEffect)(() => {
		const handleFullscreenChange = () => {
			if (!document.fullscreenElement) setSimulatorExpanded(false);
		};
		document.addEventListener("fullscreenchange", handleFullscreenChange);
		return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
	}, []);
	const handleFullscreen = async () => {
		if (simulatorExpanded) {
			if (document.fullscreenElement) await document.exitFullscreen();
			setSimulatorExpanded(false);
			return;
		}
		setSimulatorExpanded(true);
		try {
			await appRef.current?.requestFullscreen();
		} catch {
			notify("Đã mở chế độ tập trung. Nhấn Esc để quay lại.");
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: `cnc-app${dragActive ? " is-dragging" : ""}${simulatorExpanded ? " is-simulator-expanded" : ""}`,
		ref: appRef,
		onDragEnter: (event) => {
			event.preventDefault();
			setDragActive(true);
		},
		onDragOver: (event) => event.preventDefault(),
		onDragLeave: (event) => {
			if (event.currentTarget === event.target) setDragActive(false);
		},
		onDrop: (event) => {
			event.preventDefault();
			setDragActive(false);
			const file = event.dataTransfer.files?.[0];
			if (file) readFile(file);
		},
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "app-header",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "brand",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "brand-mark",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
								name: "crosshair",
								size: 23
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "brand-copy",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "LAX CNC STUDIO" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "G-CODE WORKSTATION · PRO" })]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "header-divider" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "project-field",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Dự án:" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								value: projectName,
								onChange: (event) => setProjectName(event.target.value),
								"aria-label": "Tên dự án"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
								name: "edit",
								size: 15
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "program-chip",
						title: fileName,
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "PROGRAM" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: fileName }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [simulation.lines.length, " LINES"] })
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						ref: fileInputRef,
						className: "visually-hidden",
						type: "file",
						accept: ".nc,.txt,.tap,.gcode,.cnc",
						onChange: handleFileInput
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						className: "import-button",
						type: "button",
						onClick: () => fileInputRef.current?.click(),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
							name: "upload",
							size: 18
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Import .NC/.TXT" })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "header-spacer" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "profile-select",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "visually-hidden",
							children: "Hồ sơ máy"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							value: profile,
							onChange: (event) => {
								setProfile(event.target.value);
								resetPlayback();
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "router-custom",
								children: "Router 3 trục · Custom"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
								value: "iso",
								children: "ISO / Fanuc cơ bản"
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "connection-state",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "status-dot" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "CNC-01" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Xử lý cục bộ" })] })]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "command-bar",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "playback-controls",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								className: "primary-control",
								type: "button",
								onClick: () => {
									if (cursor >= simulation.segments.length - 1 && segmentProgress >= 1) {
										setCursor(0);
										setSegmentProgress(0);
									}
									setPlaying((value) => !value);
								},
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
									name: playing ? "pause" : "play",
									size: 20
								}), playing ? "Pause" : "Play"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								className: "secondary-control",
								type: "button",
								onClick: stepForward,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
									name: "step",
									size: 19
								}), "Step"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								className: "secondary-control",
								type: "button",
								onClick: resetPlayback,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
									name: "reset",
									size: 19
								}), "Reset"]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: `playback-readout${playing ? " is-running" : ""}`,
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "BLOCK" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: activeSegment?.lineNumber ?? 0 })] }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: playing ? "RUNNING" : "READY" })
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "toolbar-divider" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "view-switch",
						"aria-label": "Góc nhìn mô phỏng",
						children: [
							"xoy",
							"xoz",
							"yoz",
							"iso"
						].map((viewMode, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: view === viewMode ? "is-active" : "",
							"aria-pressed": view === viewMode,
							title: `${VIEW_META[viewMode].title} · phím ${index + 1}`,
							onClick: () => changeView(viewMode),
							children: [
								viewMode === "iso" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
									name: "cube",
									size: 15
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: VIEW_META[viewMode].short }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("kbd", { children: index + 1 })
							]
						}, viewMode))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "speed-control",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Tốc độ" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							value: speed,
							onChange: (event) => setSpeed(Number(event.target.value)),
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: .5,
									children: "0.5×"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: 1,
									children: "1×"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: 2,
									children: "2×"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: 4,
									children: "4×"
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "toolbar-spacer" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "canvas-tools",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
								icon: "panel",
								label: codeCollapsed ? "Hiện bảng G-code" : "Ẩn bảng G-code",
								onClick: () => setCodeCollapsed((value) => !value),
								active: codeCollapsed
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
								icon: "crosshair",
								label: "Về gốc và vừa khung",
								onClick: resetView
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
								icon: simulatorExpanded ? "collapse" : "fullscreen",
								label: simulatorExpanded ? "Thoát toàn màn hình" : "Toàn màn hình mô phỏng",
								onClick: () => void handleFullscreen(),
								active: simulatorExpanded
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
								icon: "zoomOut",
								label: "Thu nhỏ",
								onClick: () => setZoom((value) => Math.max(.35, value / 1.18))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
								icon: "zoomIn",
								label: "Phóng to",
								onClick: () => setZoom((value) => Math.min(6, value * 1.18))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
								icon: "hand",
								label: view === "iso" ? "Xoay và di chuyển góc nhìn 3D" : "Kéo để di chuyển bản vẽ",
								onClick: () => notify(view === "iso" ? "Chuột trái để xoay; Shift hoặc chuột phải để pan." : "Giữ và kéo trực tiếp trên vùng mô phỏng.")
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
								icon: "ruler",
								label: "Kích thước và khoảng cách chi tiết",
								onClick: () => setDrawer("parts"),
								active: drawer === "parts"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
								icon: "settings",
								label: "Thiết lập phôi và máy",
								onClick: () => setSettingsOpen(true)
							})
						]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: `workspace${codeCollapsed ? " is-code-collapsed" : ""}`,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
					className: "code-panel",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "panel-titlebar",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "panel-title-copy",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "PROGRAM" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: fileName })]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "panel-title-actions",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "program-count",
									children: [
										simulation.lines.length,
										" LINES · ",
										simulation.segments.length,
										" MOVES"
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => {
										setDraftCode(code);
										setEditorOpen(true);
									},
									"aria-label": "Sửa G-code",
									title: "Sửa hoặc dán G-code",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
										name: "edit",
										size: 17
									})
								})]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "code-lines",
							ref: codeScrollRef,
							children: simulation.lines.map((line, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: `code-line${index === currentLine ? " is-active" : ""}`,
								"data-code-line": index,
								onClick: () => seekToLine(index),
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "line-marker",
										children: index === currentLine ? "▶" : ""
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "line-number",
										children: String(index + 1).padStart(4, "0")
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { children: line ? syntaxLine(line) : " " })
								]
							}, `${index}-${line}`))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "code-statusbar",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
								"Dòng ",
								currentLine + 1,
								" / ",
								simulation.lines.length
							] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "code-mode-badges",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: simulation.finalState.absolute ? "G90 ABS" : "G91 INC" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: simulation.finalState.units === "mm" ? "G21 MM" : "G20 INCH" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "G17 XY" })
								]
							})]
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "simulation-panel",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "simulation-titlebar",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "simulation-heading",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: VIEW_META[view].title.toUpperCase() }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", {
										className: `simulation-state${playing ? " is-running" : ""}`,
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}), playing ? "LIVE" : "READY"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
										"BLOCK ",
										activeSegment?.lineNumber ?? 0,
										" · ",
										simulation.segments.length,
										" ",
										"chuyển động · ",
										simulation.parts.length,
										" chi tiết"
									] })
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "path-legend",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "legend-line cut" }), " Cắt"] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										type: "button",
										className: `rapid-toggle${showRapids ? " is-active" : ""}`,
										"aria-pressed": showRapids,
										onClick: () => setShowRapids((value) => !value),
										title: "Ẩn hoặc hiện đường chạy nhanh G0",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "legend-line rapid" }),
											" Chạy nhanh",
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: showRapids ? "HIỆN" : "ẨN" })
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { className: "legend-dot" }), " Vị trí dao"] })
								]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolpathCanvas, {
							simulation,
							stock,
							cursor,
							segmentProgress,
							playing,
							view,
							zoom,
							pan,
							orbit,
							showRapids,
							onZoom: setZoom,
							onPan: setPan,
							onOrbit: setOrbit,
							onResetView: resetView
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "scrubber",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "scrubber-clock",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "ĐÃ CHẠY" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: formatTime(simulation.estimatedSeconds * (totalProgress / 100)) })]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "range",
									min: 0,
									max: 1e3,
									value: Math.round(totalProgress * 10),
									"aria-label": "Tiến độ mô phỏng",
									onChange: (event) => {
										const exact = Number(event.target.value) / 1e3 * simulation.segments.length;
										setPlaying(false);
										setCursor(Math.min(simulation.segments.length - 1, Math.max(0, Math.floor(exact))));
										setSegmentProgress(exact - Math.floor(exact));
									}
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "scrubber-progress",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [totalProgress.toFixed(0), "%"] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
										Math.min(cursor + 1, simulation.segments.length),
										"/",
										simulation.segments.length,
										" MOVE"
									] })]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "scrubber-clock",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "TỔNG" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: formatTime(simulation.estimatedSeconds) })]
								})
							]
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "metrics-strip",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(MetricCard, {
						icon: "sheet",
						label: "Phôi",
						detail: `Dày ${stock.thickness.toFixed(1)} mm · Gốc X${stock.originX} Y${stock.originY}`,
						onClick: () => setSettingsOpen(true),
						children: [
							stock.width.toFixed(0),
							" × ",
							stock.height.toFixed(0),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: " mm" })
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(MetricCard, {
						icon: "tool",
						label: "Dao",
						detail: `F${activeSegment?.feed.toFixed(0) ?? 0} · S${activeSegment?.spindle.toFixed(0) ?? 0}`,
						children: [activeSegment?.tool === "—" ? simulation.finalState.tool : activeSegment?.tool, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
							" · Ø",
							stock.toolDiameter,
							" mm"
						] })]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetricCard, {
						icon: "route",
						label: "Quãng cắt",
						detail: `Chạy nhanh ${formatLength(simulation.rapidLength)}`,
						children: formatLength(simulation.cutLength)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetricCard, {
						icon: "clock",
						label: "Thời gian",
						detail: `Còn ${formatTime(simulation.estimatedSeconds * (1 - totalProgress / 100))}`,
						children: formatTime(simulation.estimatedSeconds)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetricCard, {
						icon: errorCount ? "warning" : "check",
						label: "Lỗi",
						tone: errorCount ? "danger" : "success",
						detail: errorCount ? "Cần xử lý" : "Không phát hiện",
						onClick: () => setDrawer("diagnostics"),
						children: errorCount
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MetricCard, {
						icon: "warning",
						label: "Cảnh báo",
						tone: warningCount ? "warning" : "success",
						detail: warningCount ? "Nhấn để kiểm tra" : "An toàn",
						onClick: () => setDrawer("diagnostics"),
						children: warningCount
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "position-metric",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Vị trí hiện tại (mm)" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "position-grid",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "X" }), currentPosition.x.toFixed(3)] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "Y" }), currentPosition.y.toFixed(3)] }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "Z" }), currentPosition.z.toFixed(3)] })
							]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "progress-metric",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Tiến độ" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "progress-row",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "progress-track",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: { width: `${totalProgress}%` } })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [totalProgress.toFixed(0), "%"] })]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", {
								className: "progress-detail",
								children: [
									"BLOCK ",
									activeSegment?.lineNumber ?? 0,
									" ·",
									" ",
									Math.min(cursor + 1, simulation.segments.length),
									"/",
									simulation.segments.length
								]
							})
						]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", {
				className: "machine-statebar",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "MODE" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: simulation.finalState.absolute ? "ABS · G90" : "INC · G91" })] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "UNIT" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: simulation.finalState.units === "mm" ? "MM · G21" : "INCH · G20" })] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "PLANE" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "XY · G17" })] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "SPINDLE" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", { children: [activeSegment?.spindle || simulation.finalState.spindle || 0, " RPM"] })] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "FEED" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", { children: ["F ", activeSegment?.feed.toFixed(0) ?? 0] })] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "SAFE Z" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: stock.safeZ.toFixed(3) })] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "DRILL" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", { children: [simulation.drillHoles, " LỖ"] })] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "statebar-spacer" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: `statebar-health${errorCount ? " has-error" : ""}`,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: errorCount ? "CHECK REQUIRED" : "PROGRAM OK" })]
					})
				]
			}),
			drawer && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				className: "drawer-backdrop",
				type: "button",
				"aria-label": "Đóng bảng phân tích",
				onClick: () => setDrawer(null)
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
				className: "analysis-drawer",
				"aria-label": "Kết quả phân tích",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "drawer-header",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "PHÂN TÍCH CHƯƠNG TRÌNH" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: drawer === "diagnostics" ? "Lỗi & cảnh báo" : "Kích thước chi tiết" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setDrawer(null),
							"aria-label": "Đóng",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: "close" })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "drawer-tabs",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: drawer === "diagnostics" ? "is-active" : "",
							onClick: () => setDrawer("diagnostics"),
							children: ["Kiểm lỗi ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: simulation.diagnostics.length })]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							className: drawer === "parts" ? "is-active" : "",
							onClick: () => setDrawer("parts"),
							children: ["Chi tiết ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: simulation.parts.length })]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "drawer-content",
						children: drawer === "diagnostics" ? simulation.diagnostics.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "diagnostic-list",
							children: simulation.diagnostics.map((diagnostic) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: `diagnostic-item is-${diagnostic.severity}`,
								onClick: () => seekToLine(diagnostic.lineIndex),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "diagnostic-icon",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
										name: diagnostic.severity === "info" ? "info" : "warning",
										size: 18
									})
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", { children: [
									"Dòng ",
									diagnostic.lineIndex + 1,
									" · ",
									diagnostic.code
								] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: diagnostic.message })] })]
							}, diagnostic.id))
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "empty-state",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
									name: "check",
									size: 38
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Không phát hiện lỗi" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Chương trình nằm trong giới hạn phôi và các trạng thái chính đã hợp lệ." })
							]
						}) : simulation.parts.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "part-summary",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Đã nhận diện" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [simulation.parts.length, " chi tiết"] })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Khoảng cách yêu cầu" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [stock.clearance.toFixed(1), " mm"] })] })]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "parts-table",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "parts-table-head",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Mã" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Kích thước bao" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Gần nhất" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Mép phôi" })
									]
								}), simulation.parts.map((part) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									className: (part.nearestGap ?? Number.POSITIVE_INFINITY) < stock.clearance || part.edgeGap < stock.clearance ? "has-warning" : "",
									onClick: () => seekToLine(part.sourceLine),
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: part.id }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
											part.width.toFixed(1),
											" × ",
											part.height.toFixed(1)
										] }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: (part.nearestGap ?? Number.POSITIVE_INFINITY) < stock.clearance ? "is-warning" : "",
											children: part.nearestGap === null ? "—" : `${part.nearestGap.toFixed(1)} mm`
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: part.edgeGap < stock.clearance ? "is-warning" : "",
											children: [part.edgeGap.toFixed(1), " mm"]
										})
									]
								}, part.id))]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "method-note",
								children: "Với biên dạng bo góc có bù dao, kích thước thành phẩm được trừ bán kính dao ở mỗi mép. Biên dạng lồng bên trong được xem là lỗ/rãnh và không tính thành tấm riêng."
							})
						] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "empty-state",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
									name: "ruler",
									size: 38
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Chưa tìm thấy đường bao kín" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Hãy nhập chương trình có chuỗi G1/G2/G3 khép kín để đo chi tiết." })
							]
						})
					})
				]
			})] }),
			settingsOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "modal-layer",
				role: "presentation",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "modal-backdrop",
					type: "button",
					"aria-label": "Đóng thiết lập",
					onClick: () => setSettingsOpen(false)
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "settings-modal",
					role: "dialog",
					"aria-modal": "true",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "modal-header",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "HỒ SƠ MÁY" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Phôi, dao và vùng an toàn" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => setSettingsOpen(false),
								"aria-label": "Đóng",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: "close" })
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "settings-grid",
							children: [
								[
									"width",
									"Dài phôi",
									"mm"
								],
								[
									"height",
									"Rộng phôi",
									"mm"
								],
								[
									"thickness",
									"Dày phôi",
									"mm"
								],
								[
									"toolDiameter",
									"Đường kính dao",
									"mm"
								],
								[
									"originX",
									"Gốc phôi X",
									"mm"
								],
								[
									"originY",
									"Gốc phôi Y",
									"mm"
								],
								[
									"safeZ",
									"Z an toàn",
									"mm"
								],
								[
									"clearance",
									"Khoảng cách tối thiểu",
									"mm"
								],
								[
									"rapidFeed",
									"Tốc độ G0",
									"mm/min"
								]
							].map(([key, label, unit]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "number",
								step: "0.1",
								value: stock[key],
								onChange: (event) => setStock((current) => ({
									...current,
									[key]: Number(event.target.value) || 0
								}))
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: unit })] })] }, key))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "profile-note",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
								name: "info",
								size: 20
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", { children: "Router Custom:" }), " `M33 S…` được hiểu là bật spindle và `G600 T…` là chọn dao. `M73/M83` được giữ như lệnh phụ trợ, không làm thay đổi hình học cho đến khi bạn cung cấp quy tắc máy chính xác."] })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "modal-actions",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "ghost-button",
								onClick: () => setStock(DEFAULT_STOCK),
								children: "Khôi phục mặc định"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "accent-button",
								onClick: () => {
									setSettingsOpen(false);
									resetPlayback();
									notify("Đã tính lại toàn bộ chương trình theo cấu hình mới.");
								},
								children: "Áp dụng & tính lại"
							})]
						})
					]
				})]
			}),
			editorOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "modal-layer",
				role: "presentation",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "modal-backdrop",
					type: "button",
					"aria-label": "Đóng trình sửa code",
					onClick: () => setEditorOpen(false)
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "code-editor-modal",
					role: "dialog",
					"aria-modal": "true",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "modal-header",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "TRÌNH SOẠN THẢO" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: fileName })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => setEditorOpen(false),
								"aria-label": "Đóng",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { name: "close" })
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
							value: draftCode,
							onChange: (event) => setDraftCode(event.target.value),
							spellCheck: false,
							"aria-label": "Nội dung G-code"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "editor-help",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Không cần dấu cách: N100G1X20Y30 vẫn đọc được." }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Space/F5: Play · F10: Step · F8: Reset" })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "modal-actions",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "ghost-button",
								onClick: () => setDraftCode(SAMPLE_GCODE),
								children: "Nạp lại code mẫu"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "accent-button",
								onClick: () => {
									const rotated = applyCode(draftCode);
									setEditorOpen(false);
									notify(rotated ? "Đã dịch lại G-code và tự xoay chiều phôi cho đúng tọa độ." : "Đã dịch lại G-code và cập nhật mô phỏng.");
								},
								children: "Dịch & mô phỏng"
							})]
						})
					]
				})]
			}),
			dragActive && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "drop-overlay",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
						name: "upload",
						size: 44
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Thả file G-code vào đây" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: ".NC · .TXT · .TAP · .GCODE · .CNC" })
				]
			}),
			toast && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "toast",
				children: toast
			})
		]
	});
}
//#endregion
export { Home as default };
