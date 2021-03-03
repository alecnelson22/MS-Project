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

let dd = 1;

// Cell Picker
let vtkCellPicker = vtk.Rendering.Core.vtkCellPicker;
let vtkSphereSource = vtk.Filters.Sources

let ColorMode = vtk.Rendering.Core.vtkMapper.ColorMode;
let ScalarMode = vtk.Rendering.Core.vtkMapper.ScalarMode;

let lookupTable = vtkColorTransferFunction.newInstance();
let vtpReader = vtkXMLPolyDataReader.newInstance();
let actor = vtkActor.newInstance();
let source;

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
  // colorBySelector.setAttribute('class', selectorClass);
  colorBySelector.setAttribute('id', 'colorBySelector');

  const componentSelector = document.createElement('select');
  // componentSelector.setAttribute('class', selectorClass);
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

  const labelSelector = document.createElement('label');
  labelSelector.style.color = 'white';
  labelSelector.setAttribute('id', 'labelSelector');

  const controlContainer = document.createElement('div');
  controlContainer.setAttribute('class', 'control');
  controlContainer.setAttribute('id', 'controlContainer');
  controlContainer.appendChild(labelSelector);
  controlContainer.appendChild(representationSelector);
  controlContainer.appendChild(presetSelector);
  controlContainer.appendChild(colorBySelector);
  controlContainer.appendChild(componentSelector);
  controlContainer.appendChild(opacitySelector);
  controlContainer.appendChild(timeSelector);
  rootControllerContainer.appendChild(controlContainer);

}


function createPipeline(fileName, fileContents) {
  // // Create UI
  setSelectors();
  document.getElementById('labelSelector').innerHTML = fileName;

  // VTK pipeline
  // const vtpReader = vtkXMLPolyDataReader.newInstance();
  vtpReader.parseAsArrayBuffer(fileContents);

  // const lookupTable = vtkColorTransferFunction.newInstance();
  source = vtpReader.getOutputData(0);

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
    let colorBySelector = document.getElementById('colorBySelector'); 
    let currProp = colorBySelector.options[colorBySelector.selectedIndex].text;
    let t = event.target.value.toString();

    // This assumes that the histo plots change with time 
    // This is not true for PORO, PERM, so we need to check if the plot needs to be updated in the first place
    // Hardcode check here at the moment
    let currProp_lower = currProp.toLowerCase();
    if (currProp_lower == 'pressure' || currProp_lower == 'sgas') {
      let p = document.getElementById('pressure');
      p.remove();
      p = document.getElementById('sgas');
      p.remove();

      let c = d3.select('#data-viewer');
      let d = resData['reservoir_data']['unstructured']['pressure'][t]
      makeHisto(c, d, 400, 'pressure');
      d = resData['reservoir_data']['unstructured']['sgas'][t]
      makeHisto(c, d, 600, 'sgas');
    }
        
    loadTimeFile(event.target.value);
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

  // Chooses which property is displayed on the grid
  // This currently is a performance bottleneck
  function updateColorBy(event) {
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

// function loadTimeFile(file, currProp) {
function loadTimeFile(time) {
  let timeFiles = ["PRESSURE", "SGAS"]
  let currProp = colorBySelector.options[colorBySelector.selectedIndex].text;

  let cd = source.getCellData();
  let test = source.getCells();
  let arrays = cd.getArrays();
  for (prop of arrays) {
    let name = prop.getName();

    if (timeFiles.includes(name)) {
      let data = source.getCellData().getArrayByName(name);
      data.setData(resData['reservoir_data']['structured'][name.toLowerCase()][time]);
    }
  }

  let dMax = resData['reservoir_data']['unstructured']['dataRanges'][currProp]['max']
  let dMin = resData['reservoir_data']['unstructured']['dataRanges'][currProp]['min']

  const dataRange = [dMin, dMax]
  const preset = vtkColorMaps.getPresetByName(presetSelector.value);
  lookupTable.applyColorMap(preset);
  lookupTable.setMappingRange(dataRange[0], dataRange[1]);
  lookupTable.updateRange();

  renderWindow.render();
}

// ----------------------------------------------------------------------------

function load(container, options) {
  autoInit = false;
  emptyContainer(container);

  if (options.files) {
    createViewer(container);
    let count = options.files.length;
    loadFile(options.files[0], count);

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
    .attr("fill", (d => binColor(d.x0)))
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