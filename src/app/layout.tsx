import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CivicLens · AI Civic Intelligence Platform",
  description:
    "Voice-first citizen grievance triage and a policymaker dashboard for AI-driven digital public infrastructure and governance.",
};

const EXTENSION_ATTRIBUTE_SCRUBBER = `(function(){if(typeof MutationObserver==="undefined")return;var strip=function(el){if(!el||el.nodeType!==1)return;var names=el.getAttributeNames?el.getAttributeNames():[];for(var i=0;i<names.length;i+=1){var n=names[i];if(n.indexOf("bis_")===0||n.indexOf("data-bis")===0||n.indexOf("data-bitwarden")===0){el.removeAttribute(n);}}};var sweep=function(root){if(!root)return;strip(root);if(root.querySelectorAll){var all=root.querySelectorAll("*");for(var j=0;j<all.length;j+=1)strip(all[j]);}};var observer=new MutationObserver(function(records){for(var i=0;i<records.length;i+=1){if(records[i].type==="attributes")strip(records[i].target);}});observer.observe(document.documentElement,{subtree:true,attributes:true});sweep(document.documentElement);if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",function(){sweep(document.documentElement);});}else{sweep(document.documentElement);}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: EXTENSION_ATTRIBUTE_SCRUBBER }} />
        {children}
      </body>
    </html>
  );
}
