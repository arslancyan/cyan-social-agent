import "./globals.css"; import type {Metadata} from "next";
export const metadata:Metadata={title:"CYAN Social Agent",description:"AI-powered social media operating system"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}