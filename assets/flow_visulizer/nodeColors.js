// src/styles/nodeColors.js

export const NODE_COLORS = {
  // Parsed from --activity-color: #E2CAFC
  purple: {
    header: '#E2CAFC',
    body: '#FFFFFF',
    border: '#B69CD6', // Darker shade of header for border
    icon: '#7B1FA2',   // Deep purple for the icon glyph
    font: '#292929'
  },
  // Parsed from --activity-color: #FFCE73
  orange: {
    header: '#FFCE73',
    body: '#FFFFFF',
    border: '#E0B055',
    icon: '#BF6C00',
    font: '#292929'
  },
  // Parsed from --activity-color: #99ddff
  blue: {
    header: '#99DDFF',
    body: '#FFFFFF',
    border: '#6CB0E0',
    icon: '#0277BD',
    font: '#292929'
  },
  // Parsed from --activity-color: rgb(188, 227, 111)
  green: {
    header: 'rgb(188, 227, 111)',
    body: '#FFFFFF',
    border: '#9EBF5C',
    icon: '#4B7012',
    font: '#292929'
  },
  // Parsed from --activity-color: #FFC7D2
  pink: {
    header: '#FFC7D2',
    body: '#FFFFFF',
    border: '#E09CA8',
    icon: '#A12A3A',
    font: '#292929'
  },
  // Default Grey fallback
  grey: {
    header: '#E0E0E0',
    body: '#FFFFFF',
    border: '#BDBDBD',
    icon: '#616161',
    font: '#292929'
  }
};

if (typeof window !== 'undefined') {
  window.FlowVisualizerNodeColors = NODE_COLORS;
}
