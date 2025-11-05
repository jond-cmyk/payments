"use client";

import React, { useEffect, useState, useRef } from 'react';
import { toast } from "sonner";

const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

const VersionChecker = () => {
  const initialVersionRef = useRef<string | null>(null);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        // Fetch the version.json file, bypassing the cache
        const response = await fetch('/version.json', {
          cache: 'no-cache',
        });

        if (!response.ok) {
          console.error('Could not fetch version.json');
          return;
        }

        const data = await response.json();
        const fetchedVersion = data.version;

        if (!initialVersionRef.current) {
          // This is the first fetch, so we store the current version
          initialVersionRef.current = fetchedVersion;
          console.log(`[VersionChecker] Initial version set to: ${fetchedVersion}`);
        } else if (initialVersionRef.current !== fetchedVersion) {
          // A new version has been detected
          console.log(`[VersionChecker] New version detected! Old: ${initialVersionRef.current}, New: ${fetchedVersion}`);
          setIsUpdateAvailable(true);
        }
      } catch (error) {
        console.error('Error checking for new version:', error);
      }
    };

    // Check immediately on component mount
    checkVersion();

    // Then, check periodically
    const intervalId = setInterval(checkVersion, CHECK_INTERVAL);

    // Clean up the interval when the component unmounts
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (isUpdateAvailable) {
      toast.info('A new version is available!', {
        action: {
          label: 'Refresh',
          onClick: () => window.location.reload(),
        },
        duration: Infinity, // Keep the toast visible until the user interacts with it
      });
    }
  }, [isUpdateAvailable]);

  return null; // This component does not render anything visible in the DOM
};

export default VersionChecker;