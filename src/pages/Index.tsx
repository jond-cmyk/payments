import { MadeWithDyad } from "@/components/made-with-dyad";
import { useSession } from "@/contexts/SessionContext";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const { user, profile, loading } = useSession();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-xl text-gray-600">Loading user data...</p>
      </div>
    );
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white shadow-sm p-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-[#00a9ff]">Payment Request App</h1>
        <div className="flex items-center space-x-4">
          {user && (
            <span className="text-sm">
              Welcome, {user.email} ({profile?.role})
            </span>
          )}
          <Button onClick={handleLogout} variant="outline">
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto p-6">
        <h2 className="text-3xl font-semibold mb-6">Dashboard</h2>
        <p className="text-lg text-gray-700">
          This is your main dashboard. Here you will see your payment requests.
        </p>
        {/* Payment request list will go here */}
      </main>
      <MadeWithDyad />
    </div>
  );
};

export default Index;