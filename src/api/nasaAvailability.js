const availabilityCache = {};

/**
 * Parses ISO8601 interval strings like "2016-11-30/2023-07-07/P1D" 
 * into Flatpickr-compatible range objects {from, to}.
 */
function parseInterval(intervalStr) {
    const parts = intervalStr.split('/');
    if (parts.length < 2) return null;
    return {
        from: parts[0],
        to: parts[1]
    };
}

/**
 * Fetches and parses WMTS capabilities to find time dimensions for a NASA layer.
 */
export async function fetchLayerAvailability(layerId) {
    if (availabilityCache[layerId]) {
        return availabilityCache[layerId];
    }

    try {
        const response = await fetch('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml');
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        const layers = Array.from(xmlDoc.querySelectorAll('Layer'));
        const targetLayer = layers.find(l => {
            const identifier = l.querySelector('Identifier')?.textContent || l.querySelector('ows\\:Identifier')?.textContent;
            return identifier === layerId;
        });

        if (!targetLayer) {
            console.warn(`[NASA] Layer ${layerId} not found in capabilities.`);
            return null;
        }

        const dimensions = Array.from(targetLayer.querySelectorAll('Dimension'));
        const timeDim = dimensions.find(d => {
            const identifier = d.querySelector('Identifier')?.textContent || d.querySelector('ows\\:Identifier')?.textContent;
            return identifier === 'Time';
        });

        if (!timeDim) {
            console.warn(`[NASA] Time dimension not found for ${layerId}.`);
            return null;
        }

        const values = Array.from(timeDim.querySelectorAll('Value')).map(v => v.textContent);
        const ranges = values.map(parseInterval).filter(Boolean);

        const availability = {
            ranges,
            default: timeDim.querySelector('Default')?.textContent
        };

        availabilityCache[layerId] = availability;
        return availability;
    } catch (error) {
        console.error('[NASA] Failed to fetch availability:', error);
        return null;
    }
}
