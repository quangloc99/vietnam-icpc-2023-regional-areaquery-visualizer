const inpElm = document.querySelector('#input') as HTMLTextAreaElement;
const statusElm = document.querySelector('#status') as HTMLDivElement;
const drawElm = document.querySelector('#draw') as SVGElement;
const controlContainerElm = document.querySelector('#control') as HTMLDivElement;
const previewLinkElm = document.querySelector('#preview-link') as HTMLTextAreaElement;

const allCheckboxes: HTMLInputElement[] = [];
const addCheckbox = (() => {
    let curId = 0;
    return (
        text: string,
        params?: {
            checked?: boolean;
        }
    ) => {
        const id = `checkbox-${curId++}`;
        const row = document.createElement('div') as HTMLDivElement;
        const checkboxElm = document.createElement('input') as HTMLInputElement;
        const labelElm = document.createElement('label') as HTMLLabelElement;

        checkboxElm.setAttribute('type', 'checkbox');
        checkboxElm.id = id;
        checkboxElm.checked = params?.checked ?? false;
        labelElm.setAttribute('for', id);
        labelElm.innerText = text;

        controlContainerElm.appendChild(row);
        row.appendChild(checkboxElm);
        row.appendChild(labelElm);

        allCheckboxes.push(checkboxElm);

        return checkboxElm;
    };
})();

const showTreeEulerTourCheckbox = addCheckbox('Show tree Euler tour', {
    checked: true,
});
const showCutVisitingOrderByVerticiesCheckbox = addCheckbox('Show cut visiting order by vertices', { checked: true });
const showCutVisitingOrderByDiagonalCheckbox = addCheckbox('Show cut visiting order by diagonal', { checked: true });

const MAX_N = 100;

class Vec2 {
    constructor(
        readonly x: number,
        readonly y: number
    ) {}

    static create(x: number, y: number) {
        return new Vec2(x, y);
    }

    add(o: Vec2): Vec2 {
        return Vec2.create(this.x + o.x, this.y + o.y);
    }

    sub(o: Vec2): Vec2 {
        return Vec2.create(this.x - o.x, this.y - o.y);
    }

    cross(o: Vec2): number {
        return this.x * o.y - o.x * this.y;
    }

    scale(scalar: number): Vec2 {
        return Vec2.create(this.x * scalar, this.y * scalar);
    }

    sqrLen(): number {
        return this.x ** 2 + this.y ** 2;
    }

    len(): number {
        return Math.sqrt(this.sqrLen());
    }

    normalized(): Vec2 {
        return this.scale(1 / this.len());
    }
}

function sign(num: number) {
    return num < 0 ? -1 : +(num > 0);
}

type Polygon = Vec2[];

function signedPolygonArea(polygon: Polygon): number {
    let ans = 0;
    for (let prv = polygon.length - 1, cur = 0; cur < polygon.length; prv = cur++) {
        ans += polygon[prv].cross(polygon[cur]);
    }
    return ans / 2;
}

function polygonCentroid(polygon: Polygon): Vec2 {
    let doubleSignedArea = 0;
    let x = 0,
        y = 0;
    for (let prv = polygon.length - 1, cur = 0; cur < polygon.length; prv = cur++) {
        const u = polygon[prv],
            v = polygon[cur];
        const c = u.cross(v);
        x += (u.x + v.x) * c;
        y += (u.y + v.y) * c;
        doubleSignedArea += c;
    }
    return Vec2.create(x / (3 * doubleSignedArea), y / (3 * doubleSignedArea));
}

function flipPolygonYUp(polygon: Polygon): Polygon {
    return polygon.map((p) => Vec2.create(p.x, -p.y));
}

type ViewBox = {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
};

function calcViewBoxDim(viewBox: ViewBox): { width: number; height: number } {
    return {
        width: viewBox.maxX - viewBox.minX,
        height: viewBox.maxY - viewBox.minY,
    };
}

function getBoundingBox(points: Vec2[]): ViewBox {
    const px = points.map((p) => p.x);
    const py = points.map((p) => p.y);
    const minX = px.reduce((a, b) => Math.min(a, b));
    const maxX = px.reduce((a, b) => Math.max(a, b));
    const minY = py.reduce((a, b) => Math.min(a, b));
    const maxY = py.reduce((a, b) => Math.max(a, b));
    return { minX, maxX, minY, maxY };
}

function extendViewBox({ minX, maxX, minY, maxY }: ViewBox, paddingRatio: number): ViewBox {
    const padding = paddingRatio * Math.max(maxX - minX, maxY - minY);
    return {
        minX: minX - padding,
        maxX: maxX + padding,
        minY: minY - padding,
        maxY: maxY + padding,
    };
}

function fitPolygonToViewBox(polygon: Polygon, viewBox: ViewBox): Polygon {
    const polygonBoundingBox = getBoundingBox(polygon);
    const polygonDim = calcViewBoxDim(polygonBoundingBox);
    const viewBoxDim = calcViewBoxDim(viewBox);
    let scaleRatio: number =
        polygonDim.height / polygonDim.width > viewBoxDim.height / viewBoxDim.width
            ? viewBoxDim.height / polygonDim.height
            : viewBoxDim.width / polygonDim.width;
    const offsetX = (viewBoxDim.width - polygonDim.width * scaleRatio) / 2;
    const offsetY = (viewBoxDim.height - polygonDim.height * scaleRatio) / 2;
    return polygon.map((p) => {
        return Vec2.create(
            (p.x - polygonBoundingBox.minX) * scaleRatio + viewBox.minX + offsetX,
            (p.y - polygonBoundingBox.minY) * scaleRatio + viewBox.minY + offsetY
        );
    });
}

function setSvgViewBox(svgElm: SVGElement, { minX, maxX, minY, maxY }: ViewBox) {
    svgElm.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
}

function createSvgElement(tagName: string) {
    return document.createElementNS('http://www.w3.org/2000/svg', tagName);
}

type SVGStyle = {
    fill?: string;
    fillOpacity?: number;
    stroke?: string;
    strokeWidth?: number;
    strokeDasharray?: number[];
};

function setSvgStyle(elm: SVGElement, params: SVGStyle) {
    elm.setAttribute('fill', params.fill ?? '');
    elm.setAttribute('fill-opacity', params.fillOpacity?.toString() ?? '');
    elm.setAttribute('stroke', params.stroke ?? '');
    elm.setAttribute('stroke-width', params.strokeWidth?.toString() ?? '');
    elm.setAttribute('stroke-dasharray', params.strokeDasharray?.join(' ') ?? '');
}

function renderPolygon(
    elm: SVGElement,
    polygon: Polygon,
    params: SVGStyle & {
        label?: {
            margin: number;
        };
    } = {}
) {
    const points = polygon.map((p) => `${p.x},${p.y}`).join(' ');
    const polygonElm = createSvgElement('polygon');
    polygonElm.setAttribute('points', points);
    setSvgStyle(polygonElm, params);
    elm.appendChild(polygonElm);

    const labelData = params.label;
    if (labelData) {
        const margin = labelData.margin;
        for (
            let prv = polygon.length - 2, cur = polygon.length - 1, nxt = 0;
            nxt < polygon.length;
            prv = cur, cur = nxt++
        ) {
            const p = polygon[cur];
            const u = polygon[nxt].sub(p).normalized();
            const v = polygon[prv].sub(p).normalized();
            const pos = u.add(v).normalized().scale(-margin).add(p);
            const textElm = createSvgElement('text');
            textElm.innerHTML = String(cur + 1);
            textElm.setAttribute('x', pos.x.toString());
            textElm.setAttribute('y', pos.y.toString());
            textElm.setAttribute('dominant-baseline', 'middle');
            textElm.setAttribute('text-anchor', 'middle');
            elm.appendChild(textElm);
        }
    }
}

function renderLine(elm: SVGElement, start: Vec2, stop: Vec2, params: SVGStyle = {}) {
    const lineElm = createSvgElement('line');
    lineElm.setAttribute('x1', start.x.toString());
    lineElm.setAttribute('y1', start.y.toString());
    lineElm.setAttribute('x2', stop.x.toString());
    lineElm.setAttribute('y2', stop.y.toString());
    setSvgStyle(lineElm, params);
    elm.appendChild(lineElm);
}

function renderCircle(
    elm: SVGElement,
    center: Vec2,
    radius: number,
    params: SVGStyle & {
        label?: string;
    } = {}
) {
    const circleElm = createSvgElement('circle');
    circleElm.setAttribute('cx', center.x.toString());
    circleElm.setAttribute('cy', center.y.toString());
    circleElm.setAttribute('r', radius.toString());
    setSvgStyle(circleElm, params);
    elm.appendChild(circleElm);
    if (params.label) {
        const textElm = createSvgElement('text');
        textElm.innerHTML = params.label;
        textElm.setAttribute('x', center.x.toString());
        textElm.setAttribute('y', center.y.toString());
        textElm.setAttribute('dominant-baseline', 'middle');
        textElm.setAttribute('text-anchor', 'middle');
        elm.appendChild(textElm);
    }
}

function addTextToElm(
    elm: HTMLElement,
    text: string,
    params: {
        color?: string;
    } = {}
) {
    const child = document.createElement('span');
    child.classList.toggle('text-element');
    child.innerText = text;
    if (params.color) child.style.color = params.color;

    elm.appendChild(child);
}

function verifyConvexPolygon(polygon: Polygon) {
    if (polygon.length < 3) throw new Error('Polygon must have size at least 3');
    let crossSign: number | undefined = undefined;
    for (
        let prv = polygon.length - 2, cur = polygon.length - 1, nxt = 0;
        nxt < polygon.length;
        prv = cur, cur = nxt++
    ) {
        const u = polygon[nxt].sub(polygon[cur]);
        const v = polygon[prv].sub(polygon[cur]);
        const curCrossSign = sign(u.cross(v));
        if (curCrossSign === 0) throw new Error('Polygon must not contain 3 consecutive colinear points');
        if (crossSign == undefined) {
            crossSign = curCrossSign;
        } else if (crossSign !== curCrossSign) {
            throw new Error('Polygon must be either listed clockwise or counter-clockwise');
        }
    }

    for (let i = 0; i < polygon.length - 2; ++i) {
        const u = polygon[i].sub(polygon[polygon.length - 1]);
        const v = polygon[polygon.length - 2].sub(polygon[polygon.length - 1]);
        const curCrossSign = sign(u.cross(v));
        if (curCrossSign !== crossSign) throw new Error('Polygon must be convex');
    }
}

type Cut = [number, number];

type Input = {
    polygon: Polygon;
    cuts: Cut[];
    lastQuery?: Cut;
};

function parseInput(inp: string): Input {
    const words = inp.split(/\s+/);
    let inpPos = 0;
    const nextNumber = (
        name: string,
        params?: {
            isInteger?: boolean;
            lowerBound?: number;
            upperBound?: number;
        }
    ) => {
        if (inpPos >= words.length) {
            throw new Error(`Expected ${name}, but the input terminated`);
        }
        const word = words[inpPos++];
        const val = +word;
        if (isNaN(val)) {
            throw new Error(`Expected ${name} to be a number, but found ${JSON.stringify(word)}`);
        }
        if (params?.isInteger) {
            if (val != Math.round(val))
                throw new Error(`Expected ${name} to be an integer, but found ${JSON.stringify(word)}`);
        }
        if (params?.lowerBound != undefined) {
            if (val < params.lowerBound)
                throw new Error(`Expected ${name} to be greater or equal ${params.lowerBound}, but found ${val}`);
        }
        if (params?.upperBound != undefined) {
            if (val > params.upperBound)
                throw new Error(`Expected ${name} to be less or equal ${params.upperBound}, but found ${val}`);
        }
        return val;
    };

    const nextChar = (name: string, validChar: string) => {
        if (inpPos >= words.length) {
            throw new Error(`Expected ${name}, but the input terminated`);
        }
        const word = words[inpPos++];
        if (word.length !== 1) {
            throw new Error(`Expected ${name} as a single character, but ${word} found`);
        }
        if (!validChar.includes(word)) {
            throw new Error(
                `Expected ${name} to be a character in ${JSON.stringify(validChar)}, but ${JSON.stringify(word)} found`
            );
        }
        return word;
    };

    const n = nextNumber('n', {
        isInteger: true,
        lowerBound: 3,
        upperBound: MAX_N,
    });
    const polygon: Polygon = [];
    for (let i = 1; i <= n; ++i) {
        const x = nextNumber(`polygon[${i}].x`, {
            isInteger: true,
            lowerBound: -1_000_000,
            upperBound: 1_000_000,
        });
        const y = nextNumber(`polygon[${i}].y`, {
            isInteger: true,
            lowerBound: -1_000_000,
            upperBound: 1_000_000,
        });
        polygon.push(Vec2.create(x, y));
    }
    verifyConvexPolygon(polygon);

    const q = nextNumber('q', {
        isInteger: true,
        lowerBound: 0,
    });

    const normalizedCut = (seg: Cut): Cut => {
        if (seg[0] > seg[1]) return [seg[1], seg[0]];
        return seg;
    };

    const areIntersected = (u: Cut, v: Cut): boolean => {
        if (u[0] == v[0] || u[0] == v[1] || u[1] == v[0] || u[1] == v[1]) return false;
        u = normalizedCut(u);
        v = normalizedCut(v);
        if (u[0] > v[0]) [u, v] = [v, u];
        return v[0] < u[1] && u[1] < v[1];
    };

    const cuts: Cut[] = [];
    let lastQuery: [number, number] | undefined = undefined;

    for (let qid = 1; qid <= q; ++qid) {
        const queryType = nextChar(`queryType[${qid}]`, '?AR');
        const u = nextNumber(`u[${qid}]`, {
            isInteger: true,
            lowerBound: 1,
            upperBound: n,
        });
        const v = nextNumber(`v[${qid}]`, {
            isInteger: true,
            lowerBound: 1,
            upperBound: n,
        });
        const curCut = normalizedCut([u - 1, v - 1]);

        if (queryType === '?') {
            lastQuery = [u - 1, v - 1];
        } else {
            lastQuery = undefined;
        }

        if (queryType === 'A') {
            if ((u - v + n) % n == 1 || (v - u + n) % n == 1 || u == v) {
                throw new Error(
                    `Invalid cut (${u}, ${v}) (query ${qid}). A cut should not be polygon edge or a single point`
                );
            }
            const wasAdded = cuts.find((u) => u[0] == curCut[0] && u[1] == curCut[1]) != undefined;
            if (wasAdded) {
                throw new Error(`Trying to add existed cut (${u}, ${v}) (query ${qid})`);
            }
            for (const cut of cuts) {
                if (areIntersected(cut, curCut)) {
                    throw new Error(
                        `Trying to add cut (${u}, ${v}) but it is intersected with cut (${cut[0] + 1}, ${cut[1] + 1})`
                    );
                }
            }

            cuts.push(curCut);
        } else if (queryType === 'R') {
            const removePos = cuts.findIndex((u) => u[0] == curCut[0] && u[1] == curCut[1]);
            if (removePos == -1) {
                throw new Error(`Trying to remove non-existing cut (${u}, ${v}) (query ${qid})`);
            }
            cuts.splice(removePos, 1);
        }
    }

    if (inpPos !== words.length) {
        throw new Error('Not all input are consummed');
    }

    return { polygon, cuts, lastQuery };
}

function processInput(input: Input): {
    subregions: number[][];
    graph: {
        adj: {
            next: number;
            cut: Cut;
        }[][];
    };
    lastQueryRegion?: {
        start: number;
        stop: number;
    };
} {
    const n = input.polygon.length;
    const cuts = input.cuts;
    const numRegion = cuts.length + 1;

    const relativeCut = (u: number, v: number) => {
        return (v - u + n) % n;
    };

    const adjVertex = Array.from({ length: n }, (_, index) => [(index - 1 + n) % n, (index + 1) % n]);
    for (const [u, v] of cuts) {
        adjVertex[u].push(v);
        adjVertex[v].push(u);
    }
    for (const [u, arr] of adjVertex.entries()) {
        arr.sort((x, y) => {
            return -(relativeCut(u, x) - relativeCut(u, y));
        });
    }
    const getNextDiagonal = (src: number, dst: number) => {
        let l = 0,
            r = adjVertex[dst].length;
        const relSrc = relativeCut(dst, src);
        while (l < r) {
            let mid = (l + r) >> 1;
            if (relativeCut(dst, adjVertex[dst][mid]) < relSrc) r = mid;
            else l = mid + 1;
        }
        if (l == adjVertex[dst].length) l = 0;
        return adjVertex[dst][l];
    };
    const iterateSubregionEdges = function* (src: number, dst: number) {
        let u = src,
            v = dst;
        for (; v !== src; [u, v] = [v, getNextDiagonal(u, v)]) {
            yield [u, v];
        }
        yield [u, v];
    };

    const subregions: number[][] = Array.from({ length: numRegion }, () => []);
    const graphAdj: {
        next: number;
        cut: Cut;
    }[][] = Array.from({ length: numRegion }, () => []);
    const arcComponent = Array.from({ length: n }, () => Array(n).fill(-1));

    let regionNum = 0;
    const dfs = (src: number, dst: number): number | undefined => {
        if (arcComponent[src][dst] !== -1) return arcComponent[src][dst];
        const isGoingInReverse = (dst + 1) % n === src;
        if (isGoingInReverse) return undefined;

        const curRegionNum = regionNum++;
        for (const [u, v] of iterateSubregionEdges(src, dst)) {
            subregions[curRegionNum].push(u);
            arcComponent[u][v] = curRegionNum;
            const adjRegionNum = dfs(v, u);
            if (adjRegionNum != undefined) {
                graphAdj[curRegionNum].push({
                    next: adjRegionNum,
                    cut: [u, v],
                });
            }
        }
        return curRegionNum;
    };
    dfs(0, 1);
    return {
        subregions,
        graph: {
            adj: graphAdj,
        },
        lastQueryRegion: input.lastQuery
            ? {
                  start: arcComponent[input.lastQuery[0]][(input.lastQuery[0] + 1) % n],
                  stop: arcComponent[input.lastQuery[1]][(input.lastQuery[1] + 1) % n],
              }
            : undefined,
    };
}

function createDebouncer(delay_ms: number, callback: (...params: unknown[]) => unknown) {
    let lastTimeoutId: number | undefined = undefined;

    return (...params: unknown[]) => {
        if (lastTimeoutId != undefined) {
            clearTimeout(lastTimeoutId);
        }
        lastTimeoutId = setTimeout(() => {
            lastTimeoutId = undefined;
            callback(...params);
        }, delay_ms);
    };
}

function restoreStateFromUrl() {
    const curUrl = new URL(window.location.href);
    const storedInput = curUrl.searchParams.get('input');
    if (storedInput) {
        inpElm.value = atob(storedInput);
    }
    const storedCheckboxes = curUrl.searchParams.get('storedCheckboxes');
    if (storedCheckboxes) {
        for (let i = 0; i < allCheckboxes.length; ++i) {
            allCheckboxes[i].checked = storedCheckboxes[i] == '1';
        }
    }
    if (curUrl.searchParams.get('preview-only') === '1') {
        const elmToHide = document.querySelectorAll('.hide-when-preview') as NodeListOf<HTMLElement>;
        for (const elm of elmToHide) {
            elm.style.display = 'none';
        }
    }
}

function storeStateToUrl() {
    const curUrl = new URL(window.location.href);
    curUrl.searchParams.set('input', btoa(inpElm.value));
    curUrl.searchParams.set('storedCheckboxes', allCheckboxes.map((c) => (c.checked ? '1' : '0')).join(''));
    window.history.replaceState({}, '', curUrl.href);
    console.log(window.location.href);
}

// Thanks chatGPT
const COLORS = [
    '#FF5733',
    '#52D726',
    '#FFC300',
    '#5E2CA5',
    '#00A8CC',
    '#FF006E',
    '#FF8C42',
    '#6F2DBD',
    '#1FA2FF',
    '#FFD700',
    '#FF3E4D',
    '#4ECDC4',
    '#FF00FF',
    '#FF5733',
    '#29A98B',
];

function getColorForNum(num: number) {
    return COLORS[num % COLORS.length];
}

function process() {
    const inputStr = inpElm.value.trim();
    if (inputStr === '') {
        statusElm.className = 'ok';
        statusElm.innerHTML = '';
        return;
    }
    drawElm.innerHTML = '';
    statusElm.innerHTML = '';
    const input = parseInput(inputStr);
    console.log(input);
    const processedInput = processInput(input);
    console.log(processedInput);

    const drawElmBounding = drawElm.getBoundingClientRect();
    const FIXED_VIEW_BOX_WIDTH = 400;
    const viewBox = {
        minX: 0,
        minY: 0,
        maxX: FIXED_VIEW_BOX_WIDTH,
        maxY: (drawElmBounding.height / drawElmBounding.width) * FIXED_VIEW_BOX_WIDTH,
    };

    setSvgViewBox(drawElm, viewBox);
    const svgFontSize = Math.min(drawElmBounding.width, drawElmBounding.height) / 40;
    drawElm.style.setProperty('font-size', svgFontSize.toString());

    const paddedViewBox = extendViewBox(viewBox, -0.05);
    const fittedPolygon = fitPolygonToViewBox(flipPolygonYUp(input.polygon), paddedViewBox);

    const subpolygons = processedInput.subregions.map((subregion) => subregion.map((u) => fittedPolygon[u]));
    const subpolygonCentroids = subpolygons.map((p) => polygonCentroid(p));

    const createEulerTourElm = () => {
        const elm = document.createElement('div');
        elm.classList.toggle('euler-tour');
        return elm;
    };
    const eulerTourElm = createEulerTourElm();
    const cutEulerTourByVerticesElm = createEulerTourElm();
    const cutEulerTourByDiagonalElm = createEulerTourElm();

    const dfsRender = (u: number, p: number, upperCut?: Cut) => {
        const uColor = getColorForNum(u);

        const isFirst = u == p;

        if (!isFirst) addTextToElm(eulerTourElm, ', ');
        addTextToElm(eulerTourElm, `${u + 1}`, { color: uColor });

        renderPolygon(drawElm, subpolygons[u], {
            fill: uColor,
            fillOpacity: 0.2,
        });
        for (const { next: v, cut } of processedInput.graph.adj[u]) {
            if (v == p) continue;

            const vColor = getColorForNum(v);
            if (!isFirst) {
                addTextToElm(cutEulerTourByVerticesElm, ', ');
                addTextToElm(cutEulerTourByDiagonalElm, ', ');
            }
            addTextToElm(cutEulerTourByVerticesElm, `${cut[0] + 1}`, {
                color: vColor,
            });
            addTextToElm(cutEulerTourByDiagonalElm, `(${cut[0] + 1}, ${cut[1] + 1})`, { color: vColor });
            dfsRender(v, u, cut);
            addTextToElm(cutEulerTourByVerticesElm, ', ');
            addTextToElm(cutEulerTourByDiagonalElm, ', ');
            addTextToElm(cutEulerTourByVerticesElm, `${cut[1] + 1}`, {
                color: vColor,
            });
            addTextToElm(cutEulerTourByDiagonalElm, `(${cut[1] + 1}, ${cut[0] + 1})`, { color: vColor });
        }

        addTextToElm(eulerTourElm, ', ');
        addTextToElm(eulerTourElm, `${u + 1}`, { color: uColor });

        if (u != p && upperCut) {
            renderLine(drawElm, fittedPolygon[upperCut[0]], fittedPolygon[upperCut[1]], {
                stroke: uColor,
                strokeWidth: 2,
            });

            renderLine(drawElm, subpolygonCentroids[u], subpolygonCentroids[p], {
                stroke: 'black',
                strokeDasharray: [3],
            });
        }

        renderCircle(drawElm, subpolygonCentroids[u], svgFontSize * 0.65, {
            label: `${u + 1}`,
            fill: 'white',
            stroke: uColor,
        });
    };

    dfsRender(0, 0);

    renderPolygon(drawElm, fittedPolygon, {
        stroke: 'black',
        fill: 'none',
        strokeWidth: 2,
        label: {
            margin: 10,
        },
    });

    statusElm.className = 'ok';
    if (showTreeEulerTourCheckbox.checked) {
        addTextToElm(statusElm, 'Tree euler tour: ');
        statusElm.appendChild(eulerTourElm);
    }
    if (showCutVisitingOrderByVerticiesCheckbox.checked) {
        addTextToElm(statusElm, 'Cut visiting order by vertices: ');
        statusElm.appendChild(cutEulerTourByVerticesElm);
    }
    if (showCutVisitingOrderByDiagonalCheckbox.checked) {
        addTextToElm(statusElm, 'Cut visiting order by diagonal: ');
        statusElm.appendChild(cutEulerTourByDiagonalElm);
    }

    if (processedInput.lastQueryRegion) {
        const { start, stop } = processedInput.lastQueryRegion;
        const trace = Array(subpolygons.length).fill(-1);
        const qu = [] as number[];
        let qh = 0;
        for (qu.push(start), trace[start] = start; qh < qu.length; ++qh) {
            const u = qu[qh];
            if (u == stop) break;
            for (const { next: v } of processedInput.graph.adj[u]) {
                if (trace[v] != -1) continue;
                trace[v] = u;
                qu.push(v);
            }
        }
        const path: number[] = [];
        for (let x = stop; x != start; x = trace[x]) {
            path.push(x);
        }
        path.push(start);
        const coverRegion = [...new Set(path.flatMap((u) => processedInput.subregions[u]))];
        coverRegion.sort((u, v) => u - v);
        const coverPolygon = coverRegion.map((v) => fittedPolygon[v]);
        renderPolygon(drawElm, coverPolygon, {
            fill: 'none',
            stroke: 'red',
            strokeWidth: 3,
            strokeDasharray: [8],
        });

        const lastQueryCoveredArea = Math.abs(signedPolygonArea(coverRegion.map((u) => input.polygon[u])));
        const lastQueryUncoveredArea = Math.abs(signedPolygonArea(input.polygon)) - lastQueryCoveredArea;
        if (input.lastQuery) {
            addTextToElm(
                statusElm,
                `Last query: ${input.lastQuery[0] + 1} ${
                    input.lastQuery[1] + 1
                }. Answer (area of removed regions): ${lastQueryUncoveredArea}. Area of kept regions: ${lastQueryCoveredArea}.`
            );
        }
    }
}

function update() {
    storeStateToUrl();
    const curUrl = new URL(window.location.href);
    curUrl.searchParams.set('preview-only', '1');
    previewLinkElm.innerText = curUrl.href;
    try {
        process();
    } catch (e: unknown) {
        statusElm.className = 'error';
        // statusElm.innerHTML = e.message + e.stack;
        if (e instanceof Error) {
            statusElm.innerText = e.message;
        } else {
            statusElm.innerText = String(e);
        }
    }
}

const debouncedUpdate = createDebouncer(300, update);

restoreStateFromUrl();
debouncedUpdate();

inpElm.addEventListener('input', debouncedUpdate);
window.addEventListener('resize', debouncedUpdate);
allCheckboxes.forEach((e) => e.addEventListener('input', update));
