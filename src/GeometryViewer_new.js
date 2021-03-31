let macro = vtk.macro;
let HttpDataAccessHelper = vtk.IO.Core.DataAccessHelper.HttpDataAccessHelper;
let vtkActor = vtk.Rendering.Core.vtkActor;
let vtkDataArray = vtk.Common.Core.vtkDataArray;
let vtkColorMaps = vtk.Rendering.Core.vtkColorTransferFunction.vtkColorMaps;
let vtkColorTransferFunction = vtk.Rendering.Core.vtkColorTransferFunction;
let vtkFullScreenRenderWindow = vtk.Rendering.Misc.vtkFullScreenRenderWindow;
let vtkMapper = vtk.Rendering.Core.vtkMapper;
let vtkURLExtract = vtk.Common.Core.vtkURLExtract;
let vtkXMLPolyDataReader = vtk.IO.XML.vtkXMLPolyDataReader;
let vtkFPSMonitor = vtk.Interaction.UI.vtkFPSMonitor;
let vtkDataSet = vtk.Common.DataModel.vtkDataSet;
let vtkCylinderSource = vtk.Filters.Sources.vtkCylinderSource;

// Cell Picker
let vtkCellPicker = vtk.Rendering.Core.vtkCellPicker;
let vtkSphereSource = vtk.Filters.Sources

let ColorMode = vtk.Rendering.Core.vtkMapper.ColorMode;
let ScalarMode = vtk.Rendering.Core.vtkMapper.ScalarMode;

let lookupTable = vtkColorTransferFunction.newInstance();
let vtpReader = vtkXMLPolyDataReader.newInstance();

let actor = vtkActor.newInstance();
let actor_inside = vtkActor.newInstance();
let source;
let source_inside;
let mapper;
let mapper_inside;

let innerPolys;
let threshDataIdx;

let files;

var global = {};
global.pipeline = {};

let autoInit = true;
let background = [0, 0, 0];
let renderWindow;
let renderer;
let presetSelector;

let time;
let resData;




let violin;

class Violin {
  constructor(data, svg, crop, xScale, yScale) {
    this.data = data;
    this.svg = svg;
    this.crop = crop;
    this.xScale = xScale;
    this.yScale = yScale;
    this.threshIdx;
    this.outlierLow;
    this.outlierHigh;
    this.bins;
    this.binIdx;
    this.showPoints = false;
  }

  // Draw circles
  circles() {
    let that = this;
    this.svg.append('g')
      .selectAll("circle")
      .data(this.data)
      .enter().append("circle")
      .attr('class', function() { return that.showPoints ? 'non_brushed' : 'hidden'})
      .attr("r", 2)
      .attr("cx", function(d) {return that.xScale(d.count)})
      .attr("cy", function(d) {return that.yScale(d.bin)});
  }

  // Draw path
  path() {
    this.svg.append("path")
    .datum(this.data)
    .style("stroke", "#0073e6")
    .style('stroke-width', '2')
    .style("fill", "none")
    .attr("d", this.line);
  }

  // Draw vertical time line
  timeLine() {
    this.svg.append("line")
    .style("stroke", "#ff4d4d")
    .attr('id', 'time-line-p')
    .attr("x1", 0)
    .attr("y1", 0)
    .attr("x2", 0)
    .attr("y2", 600)
  }

  // Draw all points representing violin points
  drawPoints() {
    //this.circles();
    this.xScale.range([0, 150]); 
    this.circles();
  }

  hidePts() {
    this.svg.selectAll('circle').attr('class', 'hidden');
  }

  showPts() {
    this.svg.selectAll('circle').attr('class', 'non_brushed');
  }

  // Draw violin border
  drawBorder() {
    let that = this;
    this.line = d3.line()
    .curve(d3.curveBasis)
    .x(function(d,i) { 
      let b = that.bins[i].toString();
      let idx = that.binIdx[b];
      return that.xScale(that.data[idx].count); })
    .y(function(d,i) { 
      let b = that.bins[i].toString();
      let idx = that.binIdx[b];
      return that.yScale(that.data[idx].bin); });
    this.path();
    this.xScale.range([0, -150]); 
    this.path();
  }
  
  update() {
    var pressure_ensemble = d3.select('#pressure-ensemble');
    pressure_ensemble.select('#pressure-violin').remove();
  
    this.xScale = d3.scaleLinear().range([0, 800]);
    this.xScale.domain([0, 64]);
  
    let data = resData['reservoir_data']['pressure_violin'][time];
    let newData = [];
    this.bins = Object.values(data);

    this.binIdx = {};
    let cIdx = 0;

    var that = this;
    function getVDat(cell) {
      if (cell in data) {
        let iCell = parseInt(cell);
        for (let bin of data[cell]) {
          if (typeof bin === 'string') {
            let d = bin.split('*');
            let b = d[0];
            let c = parseInt(d[1]);
            if (!(b in that.binIdx)) {
              newData.push({"bin": parseInt(b), "count": c, "cells": [iCell]})
              that.binIdx[b] = cIdx;
              cIdx++; 
            }
            else {
              let i = that.binIdx[b];
              newData[i]["count"] += c;
              newData[i]["cells"].push(iCell); 
            }
          }
          else {
            bin = bin.toString();
            if (!(bin in that.binIdx)) {
              newData.push({"bin": parseInt(bin), "count": 1, "cells": [iCell]})
              that.binIdx[bin] = cIdx;
              cIdx++; 
            }
            else {
              let i = that.binIdx[bin];
              newData[i]["count"]++;
              newData[i]["cells"].push(iCell); 
            }
          }
        }
      }
    }
  
    if (this.threshIdx.length > 0) {
      for (let cell of this.threshIdx) {
        getVDat(cell.toString());
      }
    }
    else {
      for (let cell in data) {
        getVDat(cell);
      }
    }
  
    let counts = [];
    this.bins = Object.keys(that.binIdx).map(Number);
    for (let b of this.bins) {
      let i = that.binIdx[b];
      let c = newData[i]["count"];
      counts.push(c);
    }

    let countsMax = d3.max(counts);
    let minBins = d3.min(this.bins);
    let maxBins = d3.max(this.bins);


    this.data = newData;
    let allBins = [];
    if (this.crop) {
      if (time != 0) {
        for (let i = 0; i < this.bins.length; i++) {
          if (this.crop) allBins.push(...Array(counts[i]).fill(this.bins[i]));  
      }
      }

      let q1 = d3.quantile(allBins, .25);
      let q3 = d3.quantile(allBins, .75);
      let iqr = q3 - q1;
      let mult = document.getElementById('iqr').value;
      this.outlierLow = q1 - mult * iqr;
      this.outlierHigh = q3 + mult * iqr;
    }
  

    this.svg = pressure_ensemble.append('g')
      .attr('id', 'pressure-violin')
      .attr("transform", "translate(" + this.xScale(time) + ", 0)")

    // Add brush for selecting data subsets
    this.svg.append('g').call(d3.brush()
    //.extent([[0,0], [800,600]]))
    .on("brush", highlightElements));
    
    this.xScale = d3.scaleLinear().range([0, 150]);
    this.yScale = d3.scaleLinear().range([600, 0]);
    this.xScale.domain([0, countsMax]);
    this.yScale.domain(this.crop ? [this.outlierLow,  this.outlierHigh] : [minBins, maxBins]); 
  
    // Redraw plot
    this.drawBorder();
    this.drawPoints();
    this.timeLine();

  
    return this.crop ? [this.outlierLow, this.outlierHigh] : [minBins, maxBins]
  }
}

// Process arguments from URL
const userParams = vtkURLExtract.extractURLParameters();

// Background handling
if (userParams.background) {
  background = userParams.background.split(',').map((s) => Number(s));
}

const selectorClass =
  background.length === 3 && background.reduce((a, b) => a + b, 0) < 1.5
    ? 'light'
    : 'dark'

// lut
const lutName = userParams.lut || 'Cool to Warm';

// field
const field = userParams.field || '';

// camera
function updateCamera(camera) {
  ['zoom', 'pitch', 'elevation', 'yaw', 'azimuth', 'roll', 'dolly'].forEach(
    (key) => {
      if (userParams[key]) {
        camera[key](userParams[key]);
      }
      renderWindow.render();
    }
  );
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

// ----------------------------------------------------------------------------
// DOM containers for UI control
// ----------------------------------------------------------------------------

const rootControllerContainer = document.createElement('div');
rootControllerContainer.setAttribute('class', 'rootController');
const addDataSetButton = document.createElement('img');
addDataSetButton.setAttribute('class', 'button');
// addDataSetButton.setAttribute('src', icon);
// addDataSetButton.setAttribute('src', 'spherical-geometry.jpg');
addDataSetButton.addEventListener('click', () => {
  const isVisible = rootControllerContainer.style.display !== 'none';
  rootControllerContainer.style.display = isVisible ? 'none' : 'flex';
});

const fpsMonitor = vtkFPSMonitor.newInstance();
const fpsElm = fpsMonitor.getFpsMonitorContainer();
fpsElm.classList.add('fpsMonitor');

// ----------------------------------------------------------------------------
// Add class to body if iOS device
// ----------------------------------------------------------------------------

const iOS = /iPad|iPhone|iPod/.test(window.navigator.platform);

if (iOS) {
  document.querySelector('body').classList.add('is-ios-device');
}

// ----------------------------------------------------------------------------

function emptyContainer(container) {
  fpsMonitor.setContainer(null);
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}

// ----------------------------------------------------------------------------

function createViewer(container) {
  const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
    background,
    rootContainer: container,
    // containerStyle: { height: '100%', width: '50%', position: 'absolute', padding: '2em' },
    containerStyle: { height: '99%', width: '50%', position: 'absolute'},
  });
  renderer = fullScreenRenderer.getRenderer();
  renderWindow = fullScreenRenderer.getRenderWindow();
  renderWindow.getInteractor().setDesiredUpdateRate(15);

  container.appendChild(rootControllerContainer);
  container.appendChild(addDataSetButton);

  if (userParams.fps) {
    if (Array.isArray(userParams.fps)) {
      fpsMonitor.setMonitorVisibility(...userParams.fps);
      if (userParams.fps.length === 4) {
        fpsMonitor.setOrientation(userParams.fps[3]);
      }
    }
    fpsMonitor.setRenderWindow(renderWindow);
    fpsMonitor.setContainer(container);
    fullScreenRenderer.setResizeCallback(fpsMonitor.update);
  }
}

function createColorLegend(
  offsetX,
  offsetY,
  preset,
  min = 0,
  max = 1
) {
  const polydata = vtk({
    vtkClass: 'vtkPolyData',
    points: {
      vtkClass: 'vtkPoints',
      dataType: 'Float32Array',
      numberOfComponents: 3,
      values: [
        offsetX,
        offsetY,
        0,
        offsetX + 100,
        offsetY,
        0,
        offsetX + 100,
        offsetY + 400,
        0,
        offsetX,
        offsetY + 400,
        0,
      ],
    },
    polys: {
      vtkClass: 'vtkCellArray',
      dataType: 'Uint16Array',
      values: [4, 0, 1, 2, 3],
    },
    pointData: {
      vtkClass: 'vtkDataSetAttributes',
      activeScalars: 0,
      arrays: [
        {
          data: {
            vtkClass: 'vtkDataArray',
            name: 'pointScalars',
            dataType: 'Float32Array',
            values: [min, min, max, max],
          },
        },
      ],
    },
  });

  const actor = vtkActor.newInstance();
  const mapper = vtkMapper.newInstance({ interpolateScalarsBeforeMapping: true });
  actor.setMapper(mapper);
  mapper.setInputData(polydata);
  actor.getProperty().set({ edgeVisibility: true, edgeColor: [1, 1, 1] });

  if (preset) {
    const preset = vtkColorMaps.getPresetByName(presetSelector.value);
    lookupTable.applyColorMap(preset);
    mapper.setLookupTable(lookupTable);
    // lookupTable.setMappingRange(dataRange[0], dataRange[1]);
    // lookupTable.updateRange();
  }

  return actor;
}


function setSelectors() {
  // Create UI
  presetSelector = document.createElement('select');
  presetSelector.setAttribute('class', selectorClass);
  presetSelector.setAttribute('id', 'presetSelector');
  presetSelector.innerHTML = vtkColorMaps.rgbPresetNames
    .map(
      (name) =>
        `<option value="${name}" ${
          lutName === name ? 'selected="selected"' : ''
        }>${name}</option>`
    )
    .join('');

  const representationSelector = document.createElement('select');
  // representationSelector.setAttribute('class', selectorClass);
  representationSelector.setAttribute('id', 'representationSelector');
  representationSelector.innerHTML = [
    'Hidden',
    'Points',
    'Wireframe',
    'Surface',
    'Surface with Edge',
  ]
    .map(
      (name, idx) =>
        `<option value="${idx === 0 ? 0 : 1}:${idx < 4 ? idx - 1 : 2}:${
          idx === 4 ? 1 : 0
        }">${name}</option>`
    )
    .join('');
  representationSelector.value = '1:2:0';

  const colorBySelector = document.createElement('select');
  colorBySelector.setAttribute('id', 'colorBySelector');

  const thresholdBySelector = document.createElement('select');
  thresholdBySelector.setAttribute('id', 'thresholdBySelector');

  const componentSelector = document.createElement('select');
  componentSelector.setAttribute('id', 'componentSelector');
  componentSelector.style.display = 'none';

  // Create opacity slider
  const opacitySelector = document.createElement('input');
  opacitySelector.setAttribute('class', selectorClass);
  opacitySelector.setAttribute('id', 'opacitySelector');
  opacitySelector.setAttribute('type', 'range');
  opacitySelector.setAttribute('value', '100');
  opacitySelector.setAttribute('max', '100');
  opacitySelector.setAttribute('min', '1');

  // Create time step slider
  const timeSelector = document.createElement('input');
  timeSelector.setAttribute('class', selectorClass);
  timeSelector.setAttribute('id', 'timeSelector');
  timeSelector.setAttribute('type', 'range');
  timeSelector.setAttribute('value', '0');

  // Create threshold input
  let lowT = document.createElement('input');
  lowT.setAttribute('id', 'lowT');
  lowT.setAttribute('type', 'text');
  lowT.setAttribute('placeholder', 'Lower Threshold');

  let highT = document.createElement('input')
  highT.setAttribute('id', 'highT');
  highT.setAttribute('type', 'text');
  highT.setAttribute('placeholder', 'Upper Threshold');

  let submit = document.createElement('input');
  submit.setAttribute('id', 'thresh-button');
  submit.setAttribute('type', 'button');
  submit.setAttribute('value', 'Apply');
  submit.addEventListener('click', function() {
    onSubmit();
    let binRange = violin.update();
    //let binRange = updateViolin(threshIdx, violinCrop);
    updateEnsemble(binRange, violin.threshIdx);
  })

  // Append to container to continue to next flex box line
  function breakLine() {
    let breakLine = document.createElement('div');
    breakLine.setAttribute('class', 'break');
    return breakLine;
  }

  // Create a text label
  function makeLabel(text) {
    let label = document.createElement('div');
    let labelText = document.createTextNode(text);
    label.appendChild(labelText);
    label.style.color = 'white';
    return label;
  }

  const labelSelector = document.createElement('label');
  labelSelector.style.color = 'white';
  labelSelector.setAttribute('id', 'labelSelector');

  const controlContainer = document.createElement('div');
  controlContainer.setAttribute('class', 'control');
  controlContainer.setAttribute('id', 'controlContainer');
  controlContainer.appendChild(labelSelector);
  controlContainer.appendChild(representationSelector);
  controlContainer.appendChild(presetSelector);
  controlContainer.appendChild(componentSelector);
  controlContainer.appendChild(makeLabel('Time step: '));
  controlContainer.appendChild(timeSelector);

  controlContainer.appendChild(breakLine());

  controlContainer.appendChild(makeLabel('Color by: '));
  controlContainer.appendChild(colorBySelector);
  controlContainer.appendChild(makeLabel('Opacity: '));
  controlContainer.appendChild(opacitySelector);

  controlContainer.appendChild(breakLine());

  controlContainer.appendChild(makeLabel('Threshold by: '));
  controlContainer.appendChild(thresholdBySelector);
  controlContainer.appendChild(lowT);
  controlContainer.appendChild(highT);
  controlContainer.appendChild(submit);
  rootControllerContainer.appendChild(controlContainer);
}

function isBrushed(brush_coords, cx, cy) {
  var x0 = brush_coords[0][0],
      x1 = brush_coords[1][0],
      y0 = brush_coords[0][1],
      y1 = brush_coords[1][1];
 return x0 <= cx && cx <= x1 && y0 <= cy && cy <= y1;
}

// Called on brushed elements from the violin plot
// Would like to split into two sections
//   1) hightlight brushed circles
//   2) hightlight corresponding cell edges
function highlightElements(event) {
  if (event.selection != null) {

    let circles = d3.select('#pressure-ensemble')
      .select('#pressure-violin')
      .selectAll('circle');

    // Unhighlight all circles
    circles.attr("class", "non_brushed");

    // Highlight brushed circles
    circles.filter(function (){
      var cx = d3.select(this).attr("cx"),
          cy = d3.select(this).attr("cy");
      return isBrushed(event.selection, cx, cy);
      })
      .attr("class", "brushed");

    var d_brushed =  d3.selectAll(".brushed").data();
    if (d_brushed.length > 0) {
      let threshCirclesIdx = [];
      for (let c of d_brushed) {
        threshCirclesIdx.push(...c.cells);
      }
      threshCirclesIdx = [...new Set(threshCirclesIdx)];  // remove duplicate elements
      let time = document.getElementById('timeSelector').value;
      let lowT = document.getElementById('lowT').value;
      let highT = document.getElementById('highT').value;
      loadTimeFile(time, lowT, highT, threshCirclesIdx);
    } 
    
  }
}

function onSubmit() {
  let time = document.getElementById('timeSelector').value;
  let lowT = document.getElementById('lowT').value;
  let highT = document.getElementById('highT').value;
  violin.threshIdx = loadTimeFile(time, lowT, highT);
}

// Draws an area chart for pMax and pMin
function drawAreaChart(xScale, yScale) {
  let pMax = resData['reservoir_data']['time_dataRanges']['PRESSURE']['max'];
  let pMin = resData['reservoir_data']['time_dataRanges']['PRESSURE']['min'];

  // Add minmax area plot
  var area = d3.area()
  .curve(d3.curveBasis)
  .x( function(d) { return xScale(d) } )
  .y0( function(d) { return yScale(pMin[d]) } )
  .y1(  function(d) { return yScale(pMax[d]) } );

  d3.select('#ensemble-min-max').append("path")
    .datum(d3.range(pMax.length))
    .attr('d', area)
    .style("stroke", "#0073e6")
    .style("fill", "#0073e6")
    .style('opacity', '.3');
}


function updateEnsemble(binRange, threshIdx=[]) {
  let pMax = resData['reservoir_data']['time_dataRanges']['PRESSURE']['max'];
  let pMin = resData['reservoir_data']['time_dataRanges']['PRESSURE']['min'];

  // set the ranges
  var x = d3.scaleLinear().range([0, 800]);
  var y = d3.scaleLinear().range([600, 0]);
  x.domain([0, pMax.length]); 
  y.domain(binRange); 

  // let plot = d3.select('#pressure-ensemble');
  //d3.select('#ensemble-max').selectAll('path').remove();

  // Update the area chart for pMin and pMax
  d3.select('#ensemble-min-max').selectAll('path').remove();
  drawAreaChart(x, y);

  let plot = d3.select('#pressure-ensemble');
  d3.select('#ensemble-xaxis').remove();
  d3.select('#ensemble-yaxis').remove();
  // Add X axis
  plot.append("g")
    .attr('id', 'ensemble-xaxis')
    .attr("transform", "translate(0,600)")
    .call(d3.axisBottom(x));
  // Add Y axis
  plot.append("g")
    .attr('id', 'ensemble-yaxis')
    .call(d3.axisLeft(y));
}


function createPipeline(fileName, fileContents) {
  // // Create UI
  setSelectors();
  document.getElementById('labelSelector').innerHTML = fileName;

  // VTK pipeline
  vtpReader.parseAsArrayBuffer(fileContents);
  source = vtpReader.getOutputData(0);
  source.buildCells();

  // Color mapper for the outer mesh
  mapper = vtkMapper.newInstance({
    interpolateScalarsBeforeMapping: false,
    useLookupTableScalarRange: true,
    lookupTable,
    scalarVisibility: false,
  });
  // Color mapper for the inner mesh
  mapper_inside = vtkMapper.newInstance({
    interpolateScalarsBeforeMapping: false,
    useLookupTableScalarRange: true,
    lookupTable,
    scalarVisibility: false,
  });

  const scalars = source.getPointData().getScalars();
  const dataRange = [].concat(scalars ? scalars.getRange() : [0, 1]);
  let activeArray = vtkDataArray;

  actor.setScale(1,1,5);

  // Create color legend
  // let preset = vtkColorMaps.getPresetByName(presetSelector.value);
  // const colorLegend = createColorLegend(0,0,preset);

  // --------------------------------------------------------------------
  // Color handling
  // --------------------------------------------------------------------

  function applyPreset() {
    const preset = vtkColorMaps.getPresetByName(presetSelector.value);
    lookupTable.applyColorMap(preset);
    lookupTable.setMappingRange(dataRange[0], dataRange[1]);
    lookupTable.updateRange();
  }
  applyPreset();
  presetSelector.addEventListener('change', applyPreset);

  // --------------------------------------------------------------------
  // Representation handling
  // --------------------------------------------------------------------

  function updateRepresentation(event) {
    const [
      visibility,
      representation,
      edgeVisibility,
    ] = event.target.value.split(':').map(Number);
    actor.getProperty().set({ representation, edgeVisibility });
    actor.setVisibility(!!visibility);
    renderWindow.render();
  }
  representationSelector.addEventListener('change', updateRepresentation);

  // --------------------------------------------------------------------
  // Opacity handling
  // --------------------------------------------------------------------

  function updateOpacity(event) {
    const opacity = Number(event.target.value) / 100;
    actor.getProperty().setOpacity(opacity);
    renderWindow.render();
  }

  opacitySelector.addEventListener('input', updateOpacity);

  // --------------------------------------------------------------------
  // Time handling
  // --------------------------------------------------------------------

  function updateTime(event) {
    time = event.target.value.toString();

    // Update histograms of time-dependent properties
    let uData = resData['reservoir_data']['unstructured'];
    let offset = 0;
    for (let p in uData) {
      if (Array.isArray(uData[p])) {
        // TODO hardcoded
        if (Array.isArray(uData[p][0]) && !p.includes('var') && !p.includes('ml')) {

          // Remove histogram, then make a new one with updated data
          let hist = document.getElementById(p);
          hist.remove();
          let c = d3.select('#data-viewer');
          let d = uData[p][time]
          makeHisto(c, d, 400 + 200 * offset, p);
          offset += 1;
        }
      }
    }

    let lowT = document.getElementById('lowT').value;
    let highT = document.getElementById('highT').value;
    violin.threshIdx = loadTimeFile(event.target.value, lowT, highT);

    //let binRange = updateViolin(threshIdx, violinCrop);
    let binRange = violin.update();
    updateEnsemble(binRange, violin.threshIdx);
        
    renderWindow.render();
  }

  timeSelector.addEventListener('input', updateTime);

  // --------------------------------------------------------------------
  // ColorBy handling
  // --------------------------------------------------------------------

  const colorByOptions = [{ value: ':', label: 'None' }].concat(
    source
      .getPointData()
      .getArrays()
      .map((a) => ({
        label: `(p) ${a.getName()}`,
        value: `PointData:${a.getName()}`,
      })),
    source
      .getCellData()
      .getArrays()
      .map((a) => ({
        label: `${a.getName()}`,
        value: `CellData:${a.getName()}`,
      }))
  );
  colorBySelector.innerHTML = colorByOptions
    .map(
      ({ label, value }) =>
        `<option value="${value}" ${
          field === value ? 'selected="selected"' : ''
        }>${label}</option>`
    )
    .join('');

// --------------------------------------------------------------------
  // Threshold Options
  // ------------------------------------------------------------------
  thresholdBySelector.innerHTML = colorByOptions
    .map(
      ({ label, value }) =>
        `<option value="${value}" ${
          field === value ? 'selected="selected"' : ''
        }>${label}</option>`
    )
    .join('');

  // Chooses which property is displayed on the grid
  // This currently is a performance bottleneck
  function updateColorBy(event) {

    // // Remove the inside actor if it is present, only show outer skin
    // renderer.removeActor(actor_inside);
    // actor.getProperty().setOpacity(1);
    // document.getElementById('lowT').value = '';

    // Check if a threshold is active
    let threshProp = document.getElementById('thresholdBySelector').options[thresholdBySelector.selectedIndex].text;
    if (threshProp == 'None') {
      var currentSource = source;
      var currentMapper = mapper;
    }
    else {
      var currentSource = source_inside;
      var currentMapper = mapper_inside;
    }

    const [location, colorByArrayName] = event.target.value.split(':');
    const interpolateScalarsBeforeMapping = location === 'PointData';
    let colorMode = ColorMode.DEFAULT;
    let scalarMode = ScalarMode.DEFAULT;
    const scalarVisibility = location.length > 0;
    if (scalarVisibility) {
      const newArray = currentSource[`get${location}`]().getArrayByName(
        colorByArrayName
      );
      activeArray = newArray;
      const newDataRange = activeArray.getRange();
      dataRange[0] = newDataRange[0];
      dataRange[1] = newDataRange[1];
      colorMode = ColorMode.MAP_SCALARS;
      // scalarMode =
      //   location === 'PointData'
      //     ? ScalarMode.USE_POINT_FIELD_DATA
      //     : ScalarMode.USE_CELL_FIELD_DATA;

      scalarMode = ScalarMode.USE_CELL_FIELD_DATA;


    } else {
      componentSelector.style.display = 'none';
    }
    currentMapper.set({
      colorByArrayName,
      colorMode,
      interpolateScalarsBeforeMapping,
      scalarMode,
      scalarVisibility,
    });
    applyPreset();
  }

  colorBySelector.addEventListener('change', function(e) {

    // If threshold is active, get color data array for inner mesh
    // We already have the thresholded indices!
    let colorProp = e.target.value.split(':')[1];
    let threshProp = document.getElementById('thresholdBySelector').options[thresholdBySelector.selectedIndex].text;

    if (colorProp === '') {

    }
    else if (threshProp != 'None') {
      if (Array.isArray(resData['reservoir_data']['unstructured'][colorProp.toLowerCase()][0])){  
        var colorData = resData['reservoir_data']['unstructured'][colorProp.toLowerCase()][time];  // time-series property, eg pressure
      }
      else {
        var colorData = resData['reservoir_data']['unstructured'][colorProp.toLowerCase()]; // static property, eg porosity
      }
  
      var newColorData = [];
      for (let i of threshDataIdx) {
        newColorData.push(colorData[i]);
      }
      innerPolys.getCellData().setScalars(
        vtkDataArray.newInstance({name: colorProp, values: newColorData})
      )

      let dMax = resData['reservoir_data']['unstructured']['dataRanges'][colorProp]['max']
      let dMin = resData['reservoir_data']['unstructured']['dataRanges'][colorProp]['min']
  
      const preset = vtkColorMaps.getPresetByName(presetSelector.value);
      lookupTable.applyColorMap(preset);
      lookupTable.setMappingRange(dMin, dMax);
      lookupTable.updateRange();
    }

    //Otherwise, get color data array for outer mesh
    else {
      let cell_data = source.getCellData();
      if (Array.isArray(resData['reservoir_data']['structured'][colorProp.toLowerCase()])){ 
        let colorData = cell_data.getArrayByName(colorProp);
        colorData.setData(resData['reservoir_data']['structured'][colorProp.toLowerCase()]);
      }
  
      let dMax = resData['reservoir_data']['structured']['dataRanges'][colorProp]['max']
      let dMin = resData['reservoir_data']['structured']['dataRanges'][colorProp]['min']
  
      const preset = vtkColorMaps.getPresetByName(presetSelector.value);
      lookupTable.applyColorMap(preset);
      lookupTable.setMappingRange(dMin, dMax);
      lookupTable.updateRange();
    }

    updateColorBy(e);

  });

  updateColorBy({ target: colorBySelector });

  // function updateColorByComponent(event) {
  //   if (mapper.getLookupTable()) {
  //     const lut = mapper.getLookupTable();
  //     if (event.target.value === -1) {
  //       lut.setVectorModeToMagnitude();
  //     } else {
  //       lut.setVectorModeToComponent();
  //       lut.setVectorComponent(Number(event.target.value));
  //       const newDataRange = activeArray.getRange(Number(event.target.value));
  //       lookupTable.setMappingRange(newDataRange[0], newDataRange[1]);
  //       lut.updateRange();
  //     }
  //     renderWindow.render();
  //   }
  // }
  // componentSelector.addEventListener('change', updateColorByComponent);

  // --------------------------------------------------------------------
  // Pipeline handling
  // --------------------------------------------------------------------

  actor.setMapper(mapper);
  mapper.setInputData(source);
  renderer.addActor(actor);

  // renderer.addActor(colorLegend);

  // Manage update when lookupTable change
  lookupTable.onModified(() => {
    renderWindow.render();
  });



//   // Cell Picker
//   const picker = vtkCellPicker.newInstance();
//   picker.setPickFromList(1);
//   picker.setTolerance(0);
//   picker.initializePickList();
//   picker.addPickList(actor);

// // Pick on mouse right click
// renderWindow.getInteractor().onRightButtonPress((callData) => {
//   if (renderer !== callData.pokedRenderer) {
//     return;
//   }

//   const pos = callData.position;
//   const point = [pos.x, pos.y, 0.0];
//   console.log(`Pick at: ${point}`);
//   picker.pick(point, renderer);

//   if (picker.getActors().length === 0) {
//     const pickedPoint = picker.getPickPosition();
//     console.log(`No cells picked, default: ${pickedPoint}`);
//   } 
  
//   else {
//     const pickedCellId = picker.getCellId();
//     console.log('Picked cell: ', pickedCellId);

//     const pickedPoints = picker.getPickedPositions();
//     for (let i = 0; i < pickedPoints.length; i++) {
//       const pickedPoint = pickedPoints[i];
//       console.log(`Picked: ${pickedPoint}`);
//     }
//   }
// });

  // First render
  renderer.resetCamera();
  renderWindow.render();

  // global.pipeline[fileName] = {
  //   actor,
  //   mapper,
  //   source,
  //   lookupTable,
  //   renderer,
  //   renderWindow,
  // };

  // Update stats
  fpsMonitor.update();
}

// ----------------------------------------------------------------------------

function createCylinder(height, radius, resolution, center) {
  const cylinder = vtkCylinderSource.newInstance();

  const actor = vtkActor.newInstance();
  const mapper = vtkMapper.newInstance();
  actor.setMapper(mapper);
  mapper.setInputConnection(cylinder.getOutputPort());

  actor.setScale(1, 1, 5);
  renderer.addActor(actor);

  cylinder.set({height: height, radius: radius, resolution: resolution, center: center, direction: [0,0,1]});
}

function loadUnstructured(file) {
  const reader = new FileReader();
  reader.onload = function onLoad(e) {

  // VTK pipeline
  vtpReader.parseAsArrayBuffer(reader.result);
  source_inside = vtpReader.getOutputData(0);
  source_inside.buildCells();
  };
  // TODO: currently hardcoded
  reader.readAsArrayBuffer(file);
}

function loadFile(file, nfiles) {
  const reader = new FileReader();
  reader.onload = function onLoad(e) {
    createPipeline(file.name, reader.result);
    let ts = document.getElementById('timeSelector');

    //TODO: currently hardcoded
    ts.setAttribute('max', 63);
    ts.setAttribute('min', '0');
  };
  reader.readAsArrayBuffer(file);
}

// TODO split function up / rename appropriately
function loadTimeFile(time, lowThresh, highThresh, threshCirclesIdx=[]) {
  let timeFiles = ["PRESSURE", "SGAS", "PRESSURE_VAR", "SGAS_VAR"];  // TODO hardcoded
  let colorProp = colorBySelector.options[colorBySelector.selectedIndex].text;
  let threshProp = thresholdBySelector.options[thresholdBySelector.selectedIndex].text;
  let threshIdx = [];
  let showColor = false;
  threshDataIdx = [];

  if (colorProp != threshProp && colorProp != 'None') {
    showColor = true;
  }

  // Threshold interior
  if (lowThresh.length > 0 || highThresh.length > 0) {
    let newThreshData = [];
  
    // Get thresholded cell data for new array
    if (Array.isArray(resData['reservoir_data']['unstructured'][threshProp.toLowerCase()][0])){  
      var threshData = resData['reservoir_data']['unstructured'][threshProp.toLowerCase()][time];  // time-series property, eg pressure
    }
    else {
      var threshData = resData['reservoir_data']['unstructured'][threshProp.toLowerCase()]; // static property, eg porosity
    }

    // If 'Color by' prop is different than threshold prop, get color prop data
    // Get thresholded cell data for new array
    if (showColor) {
      if (Array.isArray(resData['reservoir_data']['unstructured'][colorProp.toLowerCase()][0])){  
        var colorData = resData['reservoir_data']['unstructured'][colorProp.toLowerCase()][time] // time-series property, eg pressure
      }
      else {
        var colorData = resData['reservoir_data']['unstructured'][colorProp.toLowerCase()] // static property, eg porosity
      }
      var newColorData = [];
    }

    // We already know the idices of the cells we would like to threshold
    // This happens when you brush select circles in the violin plot
    if (threshCirclesIdx.length > 0) {
      let allThreshIdx = [];
      for (let i of threshCirclesIdx) {
        let ptr = i * 6;
        for (let j = ptr; j < (ptr + 6); j++) {
          allThreshIdx.push(j);
        }
        if (showColor) newColorData.push(...colorData.slice(ptr, ptr+6));
        newThreshData.push(...threshData.slice(ptr, ptr+6));
      }
      threshIdx = threshCirclesIdx;
      threshDataIdx = allThreshIdx;
    }
    
    else {
      // Grab data who meets threshold criteria
      for (let i = 0; i < threshData.length; i++) {
        if (lowThresh.length > 0 && highThresh.length > 0) {
          if (threshData[i] > lowThresh && threshData[i] < highThresh) {  
            newThreshData.push(threshData[i]);
            if (showColor) newColorData.push(colorData[i]);
            threshDataIdx.push(i);
          }
        }
        else if (lowThresh.length > 0) {
          if (threshData[i] > lowThresh) {  
            newThreshData.push(threshData[i]);
            if (showColor) newColorData.push(colorData[i]);
            threshDataIdx.push(i);
          }
        }
        else if (highThresh.length > 0) {
          if (threshData[i] < highThresh) {  
            newThreshData.push(threshData[i]);
            if (showColor) newColorData.push(colorData[i]);
            threshDataIdx.push(i);
          }
        }
      }
      for (let x of threshDataIdx) {
        if (x % 6 == 0) {
          threshIdx.push(x / 6);
        }
      }
    }
  
    // Get thresholded polys/points data for new arrays
    let polys_data = source_inside.getPolys().getData();
    let points_data = source_inside.getPoints().getData();
    let cells_loc_data = source_inside.getCells().getLocationArray();

    let newPolysData= [];
    let newPointsData = [];
    let currPolyPtr = 0;
    for (let i = 0; i < threshDataIdx.length; i++) {
      let polys_idx = cells_loc_data[0][threshDataIdx[i]];
      let pd = polys_data.slice(polys_idx, polys_idx + 5);
      let npd = [pd[0]];
      for (let k = currPolyPtr; k < currPolyPtr + 4; k++) {
        npd.push(k);
      }
      currPolyPtr += 4;
      newPolysData.push(...npd);
      for (let j = 1; j < pd.length; j++) {
        let poly_ptr = pd[j] * 3;
        let poly_pts = points_data.slice(poly_ptr, poly_ptr + 3);
        newPointsData.push(...poly_pts);
      }
    }

    innerPolys = vtk.Common.DataModel.vtkPolyData.newInstance();
    innerPolys.getCellData().setScalars(
      vtkDataArray.newInstance({name: threshProp, values: newThreshData})
    )
    if (showColor) {
      innerPolys.getCellData().setScalars(
        vtkDataArray.newInstance({name: colorProp, values: newColorData})
      )

      let dMax = resData['reservoir_data']['structured']['dataRanges'][colorProp]['max']
      let dMin = resData['reservoir_data']['structured']['dataRanges'][colorProp]['min']
    
      const preset = vtkColorMaps.getPresetByName(presetSelector.value);
      lookupTable.applyColorMap(preset);
      lookupTable.setMappingRange(dMin, dMax);
      lookupTable.updateRange();  
    }

    innerPolys.getPoints().setData(newPointsData);
    innerPolys.getPolys().setData(newPolysData);
  
    // innerPolys = buildThreshCells(threshProp, threshDataIdx);

    //mapper_inside = vtkMapper.newInstance();
    actor_inside.setMapper(mapper_inside);
    actor.getProperty().setOpacity(0.05);
    mapper_inside.setInputData(innerPolys);
    actor_inside.setScale(1, 1, 5);
    renderer.addActor(actor_inside);
  }

  // Update the skin only
  else {
    let cell_data = source.getCellData();
    if (timeFiles.includes(threshProp)) {
      let threshData = cell_data.getArrayByName(threshProp);
      threshData.setData(resData['reservoir_data']['structured'][threshProp.toLowerCase()][time]);
    }
    if (showColor) {
      let dMax = resData['reservoir_data']['structured']['dataRanges'][colorProp]['max']
      let dMin = resData['reservoir_data']['structured']['dataRanges'][colorProp]['min']

      const preset = vtkColorMaps.getPresetByName(presetSelector.value);
      lookupTable.applyColorMap(preset);
      lookupTable.setMappingRange(dMin, dMax);
      lookupTable.updateRange();
    }
    renderer.removeActor(actor_inside);
    actor.getProperty().setOpacity(1);
  }

  renderWindow.render();

  return threshIdx;
}

// ----------------------------------------------------------------------------

function load(container, options) {
  autoInit = false;
  emptyContainer(container);

  if (options.files) {
    createViewer(container);
    let count = options.files.length;
    loadFile(options.files[0], count);
    loadUnstructured(options.files[1]);

    updateCamera(renderer.getActiveCamera());
  } else if (options.fileURL) {
    const urls = [].concat(options.fileURL);
    const progressContainer = document.createElement('div');
    progressContainer.setAttribute('class', 'progress');
    container.appendChild(progressContainer);

    const progressCallback = (progressEvent) => {
      if (progressEvent.lengthComputable) {
        const percent = Math.floor(
          (100 * progressEvent.loaded) / progressEvent.total
        );
        progressContainer.innerHTML = `Loading ${percent}%`;
      } else {
        progressContainer.innerHTML = macro.formatBytesToProperUnit(
          progressEvent.loaded
        );
      }
    };

    createViewer(container);
    const nbURLs = urls.length;
    let nbLoadedData = 0;

    while (urls.length) {
      const url = urls.pop();
      const name = Array.isArray(userParams.name)
        ? userParams.name[urls.length]
        : `Data ${urls.length + 1}`;
      HttpDataAccessHelper.fetchBinary(url, {
        progressCallback,
      }).then((binary) => {
        nbLoadedData++;
        if (nbLoadedData === nbURLs) {
          container.removeChild(progressContainer);
        }
        createPipeline(name, binary);
        updateCamera(renderer.getActiveCamera());
      });
    }
  }

  // D3 Data Loading
  loadData().then(function(data1) {
    resData = data1;
    var pc = d3.select('body').append('g')
    .style('width', '50%')
    .style('height', '100%')
    .style('float', 'right')

    var canvas = pc.append('svg')
    .attr('id', 'data-viewer')
    .style('width', '100%')
    .style('height', '25%')
      .style('background-color', 'gray')

    makeHisto(canvas, data1['reservoir_data']['unstructured']['poro'], 0, 'poro');
    makeHisto(canvas, data1['reservoir_data']['unstructured']['perm'], 200, 'perm');
    makeHisto(canvas, data1['reservoir_data']['unstructured']['pressure'][0], 400, 'pressure');
    makeHisto(canvas, data1['reservoir_data']['unstructured']['sgas'][0], 600, 'sgas');


    let pMax = resData['reservoir_data']['time_dataRanges']['PRESSURE']['max'];
    let pMin = resData['reservoir_data']['time_dataRanges']['PRESSURE']['min'];
    let sMax = resData['reservoir_data']['time_dataRanges']['SGAS']['max'];
    let sMin = resData['reservoir_data']['time_dataRanges']['SGAS']['min'];

    let ensembleControls = pc.append('div')
    .style('width', '100%')
    .style('height', '4%')
    .attr('id', 'ensemble-controls');

    ensembleControls.append('text')
      .text('Ensemble data: ');

    let ensembleOptions = ["PRESSURE", "SGAS"];
    let dropdown = ensembleControls.append('select');
    let options = dropdown.selectAll('option').data(ensembleOptions).enter().append('option');
    options.text(function(d) {
      return d;
    })

    ensembleControls.append('text')
      .text('Interquartile range multiplier: ');

    ensembleControls.append('input') 
      .attr('id', 'iqr')   
      .attr('type', 'text')
      .attr('value', 1.5);

    ensembleControls.append('input')
      .attr('type', 'button')
      .attr('id', 'iqr-button-crop')
      .attr('value', 'Crop plot');

    ensembleControls.append('input')
    .attr('type', 'button')
    .attr('id', 'iqr-button-points')
    .attr('value', 'Show points');

    document.getElementById('iqr-button-crop').addEventListener('click', function() {
      violin.crop = !violin.crop;
      d3.select('#iqr-button-crop').attr('value', function() {return violin.crop ? 'Uncrop plot' : 'Crop plot'});
      let binRange = violin.update(this.threshIdx, this.crop);
      updateEnsemble(binRange, violin.threshIdx);
    })

    document.getElementById('iqr-button-points').addEventListener('click', function() {
      violin.showPoints = !violin.showPoints;
      d3.select('#iqr-button-points').attr('value', function() {
        if (violin.showPoints) {
          violin.showPts();
          return 'Hide points';
        }
        else {
          violin.hidePts();
          return 'Show points';
        }
      })
    })




    // PRESSURE range plot
    var plot = pc.append('svg')      
      .style('width', '100%')
      .style('height', '70%')
      .style('background-color', 'gray')
      .append('g')
      .attr('id', 'pressure-ensemble')
      .attr('transform', 'translate(60, 20)');


    // set the ranges
    var x = d3.scaleLinear().range([0, 800]);
    var y = d3.scaleLinear().range([600, 0]);
    // Scale the range of the data
    x.domain([0, pMax.length]);
    y.domain([d3.min(pMin), d3.max(pMax)]);

    // Draw area chart for pMin and pMax
    d3.select('#pressure-ensemble')
      .append('g')
      .attr('id', 'ensemble-min-max');
    drawAreaChart(x, y);

    // // Add brush for selecting data subsets
    // plot.call(d3.brush()
    // .extent([[0,0], [800,600]]))
    // .on("brush", highlightElements);
    

    // Add X axis
    plot.append("g")
      .attr('id', 'ensemble-xaxis')
      .attr("transform", "translate(0,600)")
      .call(d3.axisBottom(x));
    // Add Y axis
    plot.append("g")
      .attr('id', 'ensemble-yaxis')
      .call(d3.axisLeft(y));
    plot.append("text")
    .attr("x", 100)
    .attr("y", -5)
    .attr("fill", "#000")
    .attr("font-weight", "bold")
    .attr("text-anchor", "middle")
    .attr("font-size", "x-small")
    .text("Average Ensemble Pressure");

    // Make a violin plot of pressure data at a single time step
    let data = resData['reservoir_data']['pressure_violin'][0];

    let newData = [];
    let cells = Object.keys(data);
    let bins = Object.values(data);

    for (let cell in data) {
      for (let bin of data[cell]) {
        if (typeof bin === 'string') {
          let d = bin.split('*');
          if (d[0] in newData) {
            newData[d[0]] += parseInt(d[1])
          }
          else {
            newData[d[0]] = parseInt(d[1])
          }
        }
        else {
          if (bin in newData) {
            newData[bin] += 1
          }
          else {
            newData[bin] = 1
          }
        }
      }
    }

    bins = Object.keys(newData).map(Number);
    let counts = Object.values(newData);
    let countsMax = d3.max(counts);

    newData = [];
    for (let i = 0; i < bins.length; i++) {
      if (bins[i] > 0 && bins[i] < 17000) {
        newData.push({"bin": bins[i], "count": counts[i].length});
      }
    }

    var vSvg = plot.append('g')
      .attr("transform", "translate(" + x(0) + ", 0)");

    x = d3.scaleLinear().range([0, 50]);
    y = d3.scaleLinear().range([600, 0]);
    x.domain([0, countsMax]);
    y.domain([d3.min(bins), d3.max(bins)]);

    // Create violin object
    violin = new Violin(newData, vSvg, false, x, y);

    violin.timeLine();

    // // Draw vertical time line
    // violin.append("line")
    //   .style("stroke", "#ff4d4d")
    //   .attr('id', 'time-line-p')
    //   .attr("x1", 0)
    //   .attr("y1", 0)
    //   .attr("x2", 0)
    //   .attr("y2", 600)
    
    violin.drawBorder();
    // violin.append("path").attr('id', 'pressure-violin')
    //   .datum(newData)
    //   .style("stroke", "#0073e6")
    //   .style("fill", "none")
    //   .attr("d", d3.line()
    //                 .curve(d3.curveBasis)
    //                 .x(function(d,i) { return x(d.count); })
    //                 .y(function(d,i) { return y(d.bin); })
    //             );


    // // Make a violin plot of sgas data at a single time step
    // let data = resData['reservoir_data']['sgas_violin'][0];

    // let newData = [];
    // let bins = Object.keys(data);
    // let counts = Object.values(data);
    // let countsMax = d3.max(counts);

    // for (let i = 0; i < bins.length; i++) {
    //   if (bins[i] > 0 && bins[i] < .98) { //TODO hardcoded
    //     newData.push({"bin": bins[i], "count": counts[i]});
    //   }
    // }

    // var violin = plot.append('g')
    //   .attr("transform", "translate(" + x(0) + ", 0)")

    // violin.append("line")
    //   .style("stroke", "#ff4d4d")
    //   .attr("x1", 0)
    //   .attr("y1", 0)
    //   .attr("x2", 0)
    //   .attr("y2", 400)
    
    // x = d3.scaleLinear().range([0, 50]);
    // y = d3.scaleLinear().range([400, 0]);
    // x.domain([0, countsMax]);
    // y.domain([d3.min(bins), d3.max(bins)]);

    // violin.append("path").attr('id', 'sgas-violin')
    //   .datum(newData)
    //   .style("stroke", "#0073e6")
    //   .style("fill", "none")
    //   .attr("d", d3.line()
    //                 .curve(d3.curveBasis)
    //                 .x(function(d,i) { return x(d.count); })
    //                 .y(function(d,i) { return y(d.bin); })
    //             );
                

    // // SGAS range plot
    // plot = canvas.append('g')
    //   .attr('id', 'sgas-ensemble')
    //   .attr('transform', 'translate(330, 270)');
    // // set the ranges
    // var x = d3.scaleLinear().range([0, 200]);
    // var y = d3.scaleLinear().range([200, 0]);
    // // Scale the range of the data
    // x.domain([0, sMax.length]);
    // y.domain([d3.min(sMin), d3.max(sMax)]);
    // // Add the sMax path
    // plot.append("path")
    // .datum(sMax)
    // .style("stroke", "#0073e6")
    // .style("fill", "none")
    // .attr("d", d3.line()
    //               .x(function(d,i) { return x(i); })
    //               .y(function(d) { return y(d); })
    //           );
    // // Add the sMin path
    // plot.append("path")
    // .datum(sMin)
    // .style("stroke", "#0073e6")
    // .style("fill", "none")
    // .attr("d", d3.line()
    //               .x(function(d,i) { return x(i); })
    //               .y(function(d) { return y(d); })
    //           );
    // // Add X axis
    // plot.append("g")
    //   .attr("transform", "translate(0,200)")
    //   .call(d3.axisBottom(x));
    // // Add Y axis
    // plot.append("g")
    //   .call(d3.axisLeft(y));
    // plot.append("text")
    // .attr("x", 100)
    // .attr("y", -5)
    // .attr("fill", "#000")
    // .attr("font-weight", "bold")
    // .attr("text-anchor", "middle")
    // .attr("font-size", "x-small")
    // .text("Average Ensemble Gas Saturation");



    let cyls = data1['reservoir_data']['well_cylinders'];
    for (let i = 0; i < cyls['centers'].length; i++) {
      createCylinder(cyls['heights'][i], 10, 10, cyls['centers'][i]);
    }
  });
}


// Creates a histogram
function makeHisto(canvas, rData, xOffset, name) {

  let x = d3.scaleLinear()
  .domain([0, 1])
  .range([xOffset + 30, xOffset + 200 - 30])
  .clamp(false);

  let colors = ["black"]
    .concat(d3.schemeCategory10)
    .concat(d3.schemePaired)
    .concat(d3.schemePastel1)
    .concat(d3.schemePastel2);

  var bin = d3.bin();
  var buckets = bin(rData);

  const width = 300,
    height = 200,
    margin = { top: 20, right: 20, bottom: 30, left: 40 },
    svg = canvas.append('g').attr('id', name),
    maxBins = d3.max(buckets, d => d.length),
    data = buckets.flat(),
    count = data.length,
    y = d3
      .scaleLinear()
      .domain([0, maxBins])
      .nice()
      .range([height - margin.bottom, margin.top]),
    frequency = y,
    xAxis = g =>
      g
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).tickSizeOuter(0))
        .call(g =>
          g
            .append("text")
            .attr("x", xOffset + 120)
            .attr("y", -150)
            .attr("fill", "#000")
            .attr("font-weight", "bold")
            .attr("text-anchor", "end")
            .text(name)
        );

  const binColor = d3
  .scaleThreshold()
  .domain(buckets.map(d => d.x0))
  .range(colors);

  svg.append("g")
    // .attr('id', name)
    .selectAll("rect")
    .data(buckets)
    .join("rect")
    .attr("fill",'#0073e6')
    // .attr("fill", (d => binColor(d.x0)))
    // .attr("x", d => x(d.x0) + 1)
    .attr("x", (d,i) => xOffset + (i * 8 + 30))
    // .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1))
    .attr("width", 8)
    .attr("y", d => y(d.length))
    .attr("height", d => y(0) - y(d.length));

  svg.append("g").call(xAxis);

  // const labels = svg
  // .append("g")
  // .selectAll("text")
  // .data(buckets.filter(d => d.length > 0))
  // .join("text")
  // .attr("x", d => ((x(d.x0) + x(d.x1)) / 2) | 0)
  // .attr("y", d => y(d.length) - 2)
  // .style("fill", "black")
  // .style("font-size", 10)
  // .style("text-anchor", "middle");

  // labels.text(d =>
  // x(d.x1) - x(d.x0) < 50
  //   ? d.length
  //   : d.length > 1
  //   ? `${d.length} items`
  //   : d.length === 1
  //   ? "1 item"
  //   : "empty bucket"
  // );
}

function initLocalFileLoader(container) {
    const exampleContainer = document.querySelector('.content');
    const rootBody = document.querySelector('body');
    const myContainer = container || exampleContainer || rootBody;
  
    if (myContainer !== container) {
      myContainer.classList.add('fullscreen');
      rootBody.style.margin = '0';
      rootBody.style.padding = '0';
    } else {
      rootBody.style.margin = '0';
      rootBody.style.padding = '0';
    }
  
    const fileContainer = document.createElement('div');
    fileContainer.innerHTML = `<div class="${'bigFileDrop'}"/><input type="file" multiple accept=".vtp" style="display: none;"/>`;
    myContainer.appendChild(fileContainer);
  
    const fileInput = fileContainer.querySelector('input');

    function handleFile(e) {
      preventDefaults(e);
      const dataTransfer = e.dataTransfer;
      // const files = e.target.files || dataTransfer.files;
      files = e.target.files || dataTransfer.files;
      if (files.length > 0) {
        myContainer.removeChild(fileContainer);
        load(myContainer, { files });
      }
    }
  
    fileInput.addEventListener('change', handleFile);
    fileContainer.addEventListener('drop', handleFile);
    fileContainer.addEventListener('click', (e) => fileInput.click());
    fileContainer.addEventListener('dragover', preventDefaults);
  }


// Look at URL an see if we should load a file
// ?fileURL=https://data.kitware.com/api/v1/item/59cdbb588d777f31ac63de08/download
if (userParams.url || userParams.fileURL) {
  const exampleContainer = document.querySelector('.content');
  const rootBody = document.querySelector('body');
  const myContainer = exampleContainer || rootBody;

  if (myContainer) {
    myContainer.classList.add('fullScreen');
    rootBody.style.margin = '0';
    rootBody.style.padding = '0';
  }

  load(myContainer, userParams);
}

// Auto setup if no method get called within 100ms
setTimeout(() => {
  if (autoInit) {
    initLocalFileLoader();
  }
}, 100);