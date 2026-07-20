import './style.css'
import { mountExhibitLattice } from './ui/exhibitLattice'
import { mountExhibitSvp } from './ui/exhibitSvp'
import { mountExhibitReduce } from './ui/exhibitReduce'
import { mountExhibitLweSis } from './ui/exhibitLweSis'
import { mountExhibitSchemes } from './ui/exhibitSchemes'

// theme flipping and persistence belong to the shared top bar (#cl-theme-toggle);
// this app only renders correctly under both html[data-theme] values.

mountExhibitLattice(document.getElementById('exhibit-lattice') as HTMLElement)
mountExhibitSvp(document.getElementById('exhibit-svp') as HTMLElement)
mountExhibitReduce(document.getElementById('exhibit-reduce') as HTMLElement)
mountExhibitLweSis(document.getElementById('exhibit-lwe-sis') as HTMLElement)
mountExhibitSchemes(document.getElementById('exhibit-schemes') as HTMLElement)
