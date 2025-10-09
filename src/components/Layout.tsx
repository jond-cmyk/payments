"use client";

import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header'; // Import the new Header component
import { Outlet } from 'react-router-dom';

const Layout = () => {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar is hidden on small screens and shown on medium/large screens */}
      <Sidebar className="hidden sm:flex" /> 
      <div className="flex-1 flex flex-col"> {/* Wrapper for header and main content */}
        <Header /> {/* Render the Header */}
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;