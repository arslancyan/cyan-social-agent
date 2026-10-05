import "./globals.css"; import type {Metadata} from "next";
export const metadata:Metadata={title:"CYAN — Social Agent",description:"CYAN is an AI-powered social media operating system with cloud automation, trend intelligence and official API publishing."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
