"use client";

import { MadeWithDyad } from "@/components/made-with-dyad";
import { useSession } from "@/integrations/supabase/SessionContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const { session, user, isLoading } = useSession();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-xl text-gray-600">Loading user session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <div className="text-center">
        {session ? (
          <>
            <h1 className="text-4xl font-bold mb-4">Welcome, {user?.email}!</h1>
            <p className="text-xl text-gray-600 mb-6">You are logged in.</p>
            <Button onClick={handleLogout}>Log Out</Button>
          </>
        ) : (
          <>
            <h1 className="text-4xl font-bold mb-4">Welcome to Your App</h1>
            <p className="text-xl text-gray-600 mb-6">Please log in to continue.</p>
            <Button onClick={() => navigate('/login')}>Go to Login</Button>
          </>
        )}
      </div>
      <MadeWithDyad />
    </div>
  );
};

export default Index;