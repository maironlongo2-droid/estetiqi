import { SignUp } from "@clerk/nextjs";

export default function CadastroPage() {
  return (
    <main className="min-h-screen bg-[#fbfaf8]">
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <SignUp
          routing="hash"
          signInUrl="/login"
          fallbackRedirectUrl="/app/onboarding"
          appearance={{
            variables: {
              colorPrimary: "#527765",
              colorBackground: "#ffffff",
            },
            elements: {
              card: "rounded-[2rem] border border-[#dfe9e3] shadow-[0_25px_80px_rgba(64,91,78,0.12)]",
              headerTitle: "text-[#30463c]",
              headerSubtitle: "text-[#78867f]",
              formButtonPrimary: "bg-[#527765] hover:bg-[#456957]",
            },
          }}
        />
      </div>
    </main>
  );
}
