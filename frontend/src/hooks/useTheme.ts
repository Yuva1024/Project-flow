import { useEffect, useState } from "react";

export function useTheme() {
    const [theme, setTheme] = useState<"dark" | "light">("dark");

    useEffect(() => {
        const storedTheme = localStorage.getItem("theme");
        if (storedTheme === "light") {
            document.documentElement.classList.add("light-theme");
            setTheme("light");
        } else {
            document.documentElement.classList.remove("light-theme");
            setTheme("dark");
        }
    }, []);

    const toggleTheme = () => {
        if (theme === "dark") {
            document.documentElement.classList.add("light-theme");
            localStorage.setItem("theme", "light");
            setTheme("light");
        } else {
            document.documentElement.classList.remove("light-theme");
            localStorage.setItem("theme", "dark");
            setTheme("dark");
        }
    };

    return { theme, toggleTheme };
}
