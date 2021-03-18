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

let dd = 1;

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

let autoInit = true;
let background = [0, 0, 0];
let renderWindow;
let renderer;
let mapper;
let presetSelector;

let resData;

let files;

var global = {};
global.pipeline = {};

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
const lutName = userParams.lut || 'erdc_rainbow_bright';

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
  submit.setAttribute('type', 'button');
  submit.setAttribute('onclick', 'onSubmit()');
  submit.setAttribute('value', 'Apply');

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

function onSubmit(e) {
  let time = document.getElementById('timeSelector').value;
  let lowT = document.getElementById('lowT').value;
  let highT = document.getElementById('highT').value;

  loadTimeFile(time, lowT, highT);
  
}

function updateEnsemble(t, binRange, threshIdx=[]) {
  let pMax = resData['reservoir_data']['time_dataRanges']['PRESSURE']['max'];
  let pMin = resData['reservoir_data']['time_dataRanges']['PRESSURE']['min'];

  // set the ranges
  var x = d3.scaleLinear().range([0, 800]);
  var y = d3.scaleLinear().range([400, 0]);
  // Scale the range of the data
  x.domain([0, pMax.length]); 
  y.domain(binRange);  //TODO remove outliers (hardcoded)

  // let plot = d3.select('#pressure-ensemble');
  d3.select('#ensemble-max').selectAll('path').remove();
  let maxPlot = d3.select('#ensemble-max').append("path")
    .datum(pMax)
    .style("stroke", "#0073e6")
    .style("fill", "none")
    .attr("d", d3.line()
                  .curve(d3.curveBasis)
                  .x(function(d,i) { return x(i); })
                  .y(function(d) { return y(d); }));

  // Add the pMin path
  d3.select('#ensemble-min').selectAll('path').remove();
  let minPlot = d3.select('#ensemble-min').append('path')
    .datum(pMin)
    .style("stroke", "#0073e6")
    .style("fill", "none")
    .attr("d", d3.line()
                  .curve(d3.curveBasis)
                  .x(function(d,i) { return x(i); })
                  .y(function(d) { return y(d); }));

  let plot = d3.select('#pressure-ensemble');
  d3.select('#ensemble-xaxis').remove();
  d3.select('#ensemble-yaxis').remove();
  // Add X axis
  plot.append("g")
    .attr('id', 'ensemble-xaxis')
    .attr("transform", "translate(0,400)")
    .call(d3.axisBottom(x));
  // Add Y axis
  plot.append("g")
    .attr('id', 'ensemble-yaxis')
    .call(d3.axisLeft(y));
}

function updateViolin(t, threshIdx=[]) {
  var pressure_ensemble = d3.select('#pressure-ensemble');
  // var sgas_ensemble = d3.select('#sgas-ensemble');
  var x = d3.scaleLinear().range([0, 800]);
  x.domain([0, 64]);

  pressure_ensemble.select('#pressure-violin').remove();
  // Make a violin plot of pressure data at a single time step
  let data = resData['reservoir_data']['pressure_violin'][t];

  let newData = [];
  let bins = Object.values(data);

  function getVDat(cell) {
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

  for (let cell in data) {
    if (threshIdx.length > 0) {
      if (threshIdx.includes(parseInt(cell))) {
        getVDat(cell);
      } 
    }
    else {
      getVDat(cell);
    }
  }


  bins = Object.keys(newData).map(Number);
  let counts = Object.values(newData);
  let countsMax = d3.max(counts);
  let minBins = d3.min(bins);
  let maxBins = d3.max(bins);

  // TODO detect outliers
  newData = [];
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] < 100000) { //TODO hardcoded
      newData.push({"bin": bins[i], "count": counts[i]});
    }
  }

  var violin = pressure_ensemble.append('g')
    .attr('id', 'pressure-violin')
    .attr("transform", "translate(" + x(t) + ", 0)")
  
  x = d3.scaleLinear().range([0, 150]);
  y = d3.scaleLinear().range([400, 0]);
  x.domain([0, countsMax]);
  y.domain([minBins, maxBins]); 

  violin.append("path")
    .datum(newData)
    .style("stroke", "#0073e6")
    .style("fill", "none")
    .attr("d", d3.line()
                  .curve(d3.curveBasis)
                  .x(function(d,i) { return x(d.count); })
                  .y(function(d,i) { return y(d.bin); })
              );

  x.range([0, -150]);
  violin.append("path")
  .datum(newData)
  .style("stroke", "#0073e6")
  .style("fill", "none")
  .attr("d", d3.line()
                .curve(d3.curveBasis)
                .x(function(d,i) { return x(d.count); })
                .y(function(d,i) { return y(d.bin); })
            );

  violin.append("line")
  .style("stroke", "#ff4d4d")
  .attr('id', 'time-line-p')
  .attr("x1", 0)
  .attr("y1", 0)
  .attr("x2", 0)
  .attr("y2", 400)

  return [minBins, maxBins]
}

// This 
function createPipeline(fileName, fileContents) {
  // // Create UI
  setSelectors();
  document.getElementById('labelSelector').innerHTML = fileName;

  // VTK pipeline
  vtpReader.parseAsArrayBuffer(fileContents);

  source = vtpReader.getOutputData(0);
  source.buildCells();

  mapper = vtkMapper.newInstance({
    interpolateScalarsBeforeMapping: false,
    useLookupTableScalarRange: true,
    lookupTable,
    scalarVisibility: false,
  });
  const scalars = source.getPointData().getScalars();
  const dataRange = [].concat(scalars ? scalars.getRange() : [0, 1]);
  let activeArray = vtkDataArray;

  actor.setScale(1,1,5);

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
    let t = event.target.value.toString();

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
          let d = uData[p][t]
          makeHisto(c, d, 400 + 200 * offset, p);
          offset += 1;
        }
      }
    }

    let lowT = document.getElementById('lowT').value;
    let highT = document.getElementById('highT').value;
    let threshIdx = loadTimeFile(event.target.value, lowT, highT);

    let binRange = updateViolin(t, threshIdx);
    updateEnsemble(t, binRange, threshIdx);
        
    renderWindow.render();

  }

  timeSelector.addEventListener('input', updateTime);

  // --------------------------------------------------------------------
  // ColorBy handling
  // --------------------------------------------------------------------

  const colorByOptions = [{ value: ':', label: 'Solid color' }].concat(
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
  // --------------------------------------------------------------------
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
    // Remove the inside actor if it is present, only show outer skin
    renderer.removeActor(actor_inside);
    actor.getProperty().setOpacity(1);
    document.getElementById('lowT').value = '';  // Get rid of 

    const [location, colorByArrayName] = event.target.value.split(':');
    const interpolateScalarsBeforeMapping = location === 'PointData';
    let colorMode = ColorMode.DEFAULT;
    let scalarMode = ScalarMode.DEFAULT;
    const scalarVisibility = location.length > 0;
    if (scalarVisibility) {
      const newArray = source[`get${location}`]().getArrayByName(
        colorByArrayName
      );
      activeArray = newArray;
      const newDataRange = activeArray.getRange();
      dataRange[0] = newDataRange[0];
      dataRange[1] = newDataRange[1];
      colorMode = ColorMode.MAP_SCALARS;
      scalarMode =
        location === 'PointData'
          ? ScalarMode.USE_POINT_FIELD_DATA
          : ScalarMode.USE_CELL_FIELD_DATA;

      const numberOfComponents = activeArray.getNumberOfComponents();
      if (numberOfComponents > 1) {
        // always start on magnitude setting
        if (mapper.getLookupTable()) {
          const lut = mapper.getLookupTable();
          lut.setVectorModeToMagnitude();
        }
        componentSelector.style.display = 'block';
        const compOpts = ['Magnitude'];
        while (compOpts.length <= numberOfComponents) {
          compOpts.push(`Component ${compOpts.length}`);
        }
        componentSelector.innerHTML = compOpts
          .map((t, index) => `<option value="${index - 1}">${t}</option>`)
          .join('');
      } else {
        componentSelector.style.display = 'none';
      }
    } else {
      componentSelector.style.display = 'none';
    }
    mapper.set({
      colorByArrayName,
      colorMode,
      interpolateScalarsBeforeMapping,
      scalarMode,
      scalarVisibility,
    });
    applyPreset();
  }

  // thresholdBySelector.addEventListener('change', updateColorBy);
  // updateColorBy({ target: thresholdBySelector });

  colorBySelector.addEventListener('change', updateColorBy);
  updateColorBy({ target: colorBySelector });

  function updateColorByComponent(event) {
    if (mapper.getLookupTable()) {
      const lut = mapper.getLookupTable();
      if (event.target.value === -1) {
        lut.setVectorModeToMagnitude();
      } else {
        lut.setVectorModeToComponent();
        lut.setVectorComponent(Number(event.target.value));
        const newDataRange = activeArray.getRange(Number(event.target.value));
        dataRange[0] = newDataRange[0];
        dataRange[1] = newDataRange[1];
        lookupTable.setMappingRange(dataRange[0], dataRange[1]);
        lut.updateRange();
      }
      renderWindow.render();
    }
  }
  componentSelector.addEventListener('change', updateColorByComponent);

  // --------------------------------------------------------------------
  // Pipeline handling
  // --------------------------------------------------------------------

  actor.setMapper(mapper);
  mapper.setInputData(source);
  renderer.addActor(actor);

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

function loadTimeFile(time, lowThresh, highThresh) {
  let timeFiles = ["PRESSURE", "SGAS", "PRESSURE_VAR", "SGAS_VAR"];
  let currProp = colorBySelector.options[colorBySelector.selectedIndex].text;
  let threshIdx = [];

  // Update the threholded inside
  if (lowThresh.length > 0 || highThresh.length > 0) {
    let points = source_inside.getPoints();
    let polys = source_inside.getPolys();
    let polys_data = polys.getData();
    let points_data = points.getData();
    let cells_loc_data = source_inside.getCells().getLocationArray();
  
    let thresholdBy = currProp;
    let newCellData = [];
    let cellDataIdx = [];
  
    // Get thresholded cell data for new array
    if (Array.isArray(resData['reservoir_data']['unstructured'][thresholdBy.toLowerCase()][time])){  
      var data = resData['reservoir_data']['unstructured'][thresholdBy.toLowerCase()][time]  // time-series property, eg pressure
    }
    else {
      var data = resData['reservoir_data']['unstructured'][thresholdBy.toLowerCase()] // static property, eg porosity
    }

    for (let i = 0; i < data.length; i++) {
      if (lowThresh.length > 0 && highThresh.length > 0) {
        if (data[i] > lowThresh && data[i] < highThresh) {  
          newCellData.push(data[i]);
          cellDataIdx.push(i);
        }
      }
      else if (lowThresh.length > 0) {
        if (data[i] > lowThresh) {  
          newCellData.push(data[i]);
          cellDataIdx.push(i);
        }
      }
      else if (highThresh.length > 0) {
        if (data[i] < highThresh) {  
          newCellData.push(data[i]);
          cellDataIdx.push(i);
        }
      }
    }

    for (let x of cellDataIdx) {
      if (x % 6 == 0) {
        threshIdx.push(x / 6);
      }
    }
  
    // Get thresholded polys/points data for new arrays
    let newPolysData= [];
    let newPointsData = [];
    let currPolyPtr = 0;
    for (let i = 0; i < cellDataIdx.length; i++) {
      let polys_idx = cells_loc_data[0][cellDataIdx[i]];
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
  
    let newPolys = vtk.Common.DataModel.vtkPolyData.newInstance();
  
    newPolys.getCellData().setScalars(
      vtkDataArray.newInstance({name: currProp, values: newCellData})
    )
    newPolys.getPoints().setData(newPointsData);
    newPolys.getPolys().setData(newPolysData);
  
    const mapper2 = vtkMapper.newInstance();
    actor_inside.setMapper(mapper2);
    actor.getProperty().setOpacity(0.05);
    mapper2.setInputData(newPolys);
  
    actor_inside.setScale(1, 1, 5);
    renderer.addActor(actor_inside);
  
    let dMax = resData['reservoir_data']['structured']['dataRanges'][currProp]['max']
    let dMin = resData['reservoir_data']['structured']['dataRanges'][currProp]['min']
  
    const dataRange = [dMin, dMax]
    const preset = vtkColorMaps.getPresetByName(presetSelector.value);
    lookupTable.applyColorMap(preset);
    lookupTable.setMappingRange(dMin, dMax);
    lookupTable.updateRange();
  }

  // Update the skin only
  else {
    let cell_data = source.getCellData();

    if (timeFiles.includes(currProp)) {
      let data = cell_data.getArrayByName(currProp);
      data.setData(resData['reservoir_data']['structured'][currProp.toLowerCase()][time]);
    }

    let dMax = resData['reservoir_data']['structured']['dataRanges'][currProp]['max']
    let dMin = resData['reservoir_data']['structured']['dataRanges'][currProp]['min']

    const dataRange = [dMin, dMax]
    const preset = vtkColorMaps.getPresetByName(presetSelector.value);
    lookupTable.applyColorMap(preset);
    lookupTable.setMappingRange(dataRange[0], dataRange[1]);
    lookupTable.updateRange();
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
    var canvas = d3.select('body').append('svg')
      .attr('id', 'data-viewer')
      .style('width', '50%')
      .style('height', '100%')
      .style('float', 'right')
      .style('background-color', 'gray')

    makeHisto(canvas, data1['reservoir_data']['unstructured']['poro'], 0, 'poro');
    makeHisto(canvas, data1['reservoir_data']['unstructured']['perm'], 200, 'perm');
    makeHisto(canvas, data1['reservoir_data']['unstructured']['pressure'][0], 400, 'pressure');
    makeHisto(canvas, data1['reservoir_data']['unstructured']['sgas'][0], 600, 'sgas');


    let pMax = resData['reservoir_data']['time_dataRanges']['PRESSURE']['max'];
    let pMin = resData['reservoir_data']['time_dataRanges']['PRESSURE']['min'];
    let sMax = resData['reservoir_data']['time_dataRanges']['SGAS']['max'];
    let sMin = resData['reservoir_data']['time_dataRanges']['SGAS']['min'];

    // PRESSURE range plot
    var plot = canvas.append('g')
      .attr('id', 'pressure-ensemble')
      .attr('transform', 'translate(60, 270)');
    // set the ranges
    var x = d3.scaleLinear().range([0, 800]);
    var y = d3.scaleLinear().range([400, 0]);
    // Scale the range of the data
    x.domain([0, pMax.length]);
    y.domain([d3.min(pMin), d3.max(pMax)]);

    // Add the pMax path
    let maxPlot = plot.append('g').attr('id', 'ensemble-max');
    maxPlot.append("path")
      .datum(pMax)
      .style("stroke", "#0073e6")
      .style("fill", "none")
      .attr("d", d3.line()
                    .curve(d3.curveBasis)
                    .x(function(d,i) { return x(i); })
                    .y(function(d) { return y(d); }));

    // Add the pMin path
    let minPlot = plot.append('g').attr('id', 'ensemble-min');
    minPlot.append("path")
      .datum(pMin)
      .style("stroke", "#0073e6")
      .style("fill", "none")
      .attr("d", d3.line()
                    .curve(d3.curveBasis)
                    .x(function(d,i) { return x(i); })
                    .y(function(d) { return y(d); }));

    // Add X axis
    plot.append("g")
      .attr('id', 'ensemble-xaxis')
      .attr("transform", "translate(0,400)")
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

    var violin = plot.append('g')
      .attr("transform", "translate(" + x(0) + ", 0)")

    violin.append("line")
      .style("stroke", "#ff4d4d")
      .attr('id', 'time-line-p')
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", 0)
      .attr("y2", 400)
    
    x = d3.scaleLinear().range([0, 50]);
    y = d3.scaleLinear().range([400, 0]);
    x.domain([0, countsMax]);
    y.domain([d3.min(bins), d3.max(bins)]);

    violin.append("path").attr('id', 'pressure-violin')
      .datum(newData)
      .style("stroke", "#0073e6")
      .style("fill", "none")
      .attr("d", d3.line()
                    .curve(d3.curveBasis)
                    .x(function(d,i) { return x(d.count); })
                    .y(function(d,i) { return y(d.bin); })
                );


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