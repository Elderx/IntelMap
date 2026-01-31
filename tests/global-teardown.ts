import { request } from '@playwright/test';

/**
 * Global teardown: Clean up test data after all tests complete
 * This runs once after all tests finish
 */
export default async () => {
  console.log('[Global Teardown] Starting test data cleanup...');

  const context = await request.newContext({
    baseURL: 'http://localhost:5173',
  });

  try {
    // Login as admin to get session cookie
    const loginResponse = await context.post('/api/login', {
      data: {
        username: 'admin',
        password: 'admin',
      },
    });

    if (!loginResponse.ok()) {
      console.warn('[Global Teardown] Failed to login for cleanup. Skipping cleanup.');
      await context.dispose();
      return;
    }

    console.log('[Global Teardown] Logged in successfully');

    // Fetch all markers and delete test ones
    const markersResponse = await context.get('/api/markers');
    if (markersResponse.ok()) {
      const markersData = await markersResponse.json();
      // API returns GeoJSON FeatureCollection: { type: "FeatureCollection", features: [...] }
      const markers = markersData.features || [];
      let deletedCount = 0;

      for (const marker of markers) {
        // Extract properties from GeoJSON Feature structure
        const props = marker.properties || {};
        const title = props.title;
        const desc = props.description;
        const id = props.id;

        // Delete markers with test-specific titles or descriptions
        if (title?.includes('Test') ||
            desc?.includes('E2E Test') ||
            title?.includes('To Delete')) {
          await context.delete(`/api/markers/${id}`);
          deletedCount++;
        }
      }
      console.log(`[Global Teardown] Deleted ${deletedCount} test markers`);
    }

    // Fetch all polygons and delete test ones
    const polygonsResponse = await context.get('/api/polygons');
    if (polygonsResponse.ok()) {
      const polygonsData = await polygonsResponse.json();
      const polygons = polygonsData.features || [];
      let deletedCount = 0;

      for (const polygon of polygons) {
        const props = polygon.properties || {};
        const title = props.title;
        const desc = props.description;
        const id = props.id;

        if (title?.includes('Test') ||
            desc?.includes('E2E Test') ||
            title?.includes('To Delete')) {
          await context.delete(`/api/polygons/${id}`);
          deletedCount++;
        }
      }
      console.log(`[Global Teardown] Deleted ${deletedCount} test polygons`);
    }

    // Fetch all circles and delete test ones
    const circlesResponse = await context.get('/api/circles');
    if (circlesResponse.ok()) {
      const circlesData = await circlesResponse.json();
      const circles = circlesData.features || [];
      let deletedCount = 0;

      for (const circle of circles) {
        const props = circle.properties || {};
        const title = props.title;
        const desc = props.description;
        const id = props.id;

        if (title?.includes('Test') ||
            desc?.includes('E2E Test') ||
            title?.includes('To Delete')) {
          await context.delete(`/api/circles/${id}`);
          deletedCount++;
        }
      }
      console.log(`[Global Teardown] Deleted ${deletedCount} test circles`);
    }

    console.log('[Global Teardown] Cleanup complete');
  } catch (error) {
    console.error('[Global Teardown] Error during cleanup:', error);
  } finally {
    await context.dispose();
  }
};
