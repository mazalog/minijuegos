import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen p-6 sm:p-10 flex flex-col items-center justify-center">
      <Image
        src="https://firebasestorage.googleapis.com/v0/b/pegalachapa.firebasestorage.app/o/RECURSOS%2FPEGALACHAPABLANCOPNG.png?alt=media&token=bffe20c0-a651-4e13-90f8-648c801c788f"
        alt="Logo Pegalachapa"
        width={320}
        height={320}
        priority
      />
    </div>
  );
}
